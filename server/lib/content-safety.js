import sharp from 'sharp';

/**
 * Azure AI Content Safety, called over REST (no SDK).
 *
 * The free F0 tier is about 5 requests a second and a monthly quota, so callers
 * send a photo once and only a few video frames. When the endpoint or the key is
 * missing (local dev, tests), every check is skipped and the on-server model is
 * the only gate. When both are set, a timeout or an error after one retry is
 * thrown: the upload must not be stored just because the service was silent.
 *
 * Image:  POST {endpoint}/contentsafety/image:analyze?api-version=2024-09-01
 * Text:   POST {endpoint}/contentsafety/text:analyze?api-version=2024-09-01
 * Header: Ocp-Apim-Subscription-Key
 *
 * Severity uses FourSeverityLevels: 0 safe, 2 low, 4 medium, 6 high.
 * Images are blocked at Sexual ≥ 2 or Violence ≥ 4.
 * Text is blocked at Sexual ≥ 2, or Hate / Violence / SelfHarm ≥ 4.
 */

export const API_VERSION = '2024-09-01';
export const REQUEST_TIMEOUT_MS = 8_000;
const TEXT_LIMIT = 10_000;
const MAX_EDGE = 1024;
const MIN_EDGE = 50;
const MAX_BYTES = 4 * 1024 * 1024;

export class ContentSafetyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ContentSafetyError';
    this.code = 'CONTENT_SAFETY_UNAVAILABLE';
  }
}

function severity(categories, name) {
  const row = (categories ?? []).find((item) => String(item?.category ?? '').toLowerCase() === name.toLowerCase());
  const value = Number(row?.severity);
  return Number.isFinite(value) ? value : 0;
}

/** categoriesAnalysis from image:analyze → blocked? */
export function imageIsBlocked(categories) {
  return severity(categories, 'Sexual') >= 2 || severity(categories, 'Violence') >= 4;
}

/** categoriesAnalysis from text:analyze → blocked? */
export function textIsBlocked(categories) {
  return (
    severity(categories, 'Sexual') >= 2 ||
    severity(categories, 'Hate') >= 4 ||
    severity(categories, 'Violence') >= 4 ||
    severity(categories, 'SelfHarm') >= 4
  );
}

/**
 * JPEG the image API will accept: longest edge at most 1024px, both edges
 * between 50 and 7200, and under 4MB. Throws ContentSafetyError when the
 * file cannot be prepared — the caller must not keep the photo.
 */
export async function imageToJpeg(filePath, { maxEdge = MAX_EDGE, minEdge = MIN_EDGE, maxBytes = MAX_BYTES } = {}) {
  let buffer;
  try {
    buffer = await sharp(filePath, { failOn: 'error', animated: false, limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82 })
      .toBuffer();
    const meta = await sharp(buffer).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < minEdge || height < minEdge) {
      buffer = await sharp(buffer)
        .resize({
          width: Math.max(width, minEdge),
          height: Math.max(height, minEdge),
          fit: 'contain',
          background: '#ffffff',
        })
        .jpeg({ quality: 82 })
        .toBuffer();
    }
    if (buffer.length > maxBytes) {
      buffer = await sharp(buffer)
        .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 60 })
        .toBuffer();
    }
  } catch (err) {
    if (err instanceof ContentSafetyError) throw err;
    throw new ContentSafetyError('could not prepare the image for content safety');
  }
  if (buffer.length > maxBytes) throw new ContentSafetyError('image is too large for content safety');
  return buffer;
}

function retryDelayMs(response) {
  const header = Number(response?.headers?.get?.('retry-after'));
  if (Number.isFinite(header) && header >= 0) return Math.min(header * 1000, 1_000);
  return 300;
}

async function postJson(fetchImpl, url, key, payload, { timeoutMs, sleep }) {
  let lastName = 'Error';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': key,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      lastName = err?.name || 'Error';
      if (attempt === 0) {
        await sleep(300);
        continue;
      }
      throw new ContentSafetyError(`content safety request failed (${lastName})`);
    }

    if (response.ok) {
      const parsed = await response.json().catch(() => null);
      if (!Array.isArray(parsed?.categoriesAnalysis)) {
        throw new ContentSafetyError('content safety returned an unexpected body');
      }
      return parsed;
    }

    const retryable = response.status === 429 || response.status >= 500;
    await response.arrayBuffer().catch(() => {});
    if (retryable && attempt === 0) {
      await sleep(retryDelayMs(response));
      continue;
    }
    throw new ContentSafetyError(`content safety HTTP ${response.status}`);
  }
  throw new ContentSafetyError(`content safety request failed (${lastName})`);
}

/**
 * A client bound to one resource. `fetchImpl` and `sleep` are injectable so
 * tests never touch the network. Returns null when the resource is not configured.
 */
export function createContentSafetyClient({
  endpoint,
  key,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  const root = typeof endpoint === 'string' ? endpoint.trim().replace(/\/+$/, '') : '';
  const subscriptionKey = typeof key === 'string' ? key.trim() : '';
  if (!root || !subscriptionKey) return null;

  const categories = ['Sexual', 'Violence', 'Hate', 'SelfHarm'];

  async function call(pathname, body) {
    const url = `${root}/contentsafety/${pathname}?api-version=${API_VERSION}`;
    return postJson(fetchImpl, url, subscriptionKey, body, { timeoutMs, sleep });
  }

  return {
    async analyzeImage(filePath) {
      const jpeg = await imageToJpeg(filePath);
      const body = await call('image:analyze', {
        image: { content: jpeg.toString('base64') },
        categories,
        outputType: 'FourSeverityLevels',
      });
      return { blocked: imageIsBlocked(body.categoriesAnalysis), categories: body.categoriesAnalysis };
    },
    async analyzeText(text) {
      const body = await call('text:analyze', {
        text: String(text),
        categories,
        outputType: 'FourSeverityLevels',
      });
      return { blocked: textIsBlocked(body.categoriesAnalysis), categories: body.categoriesAnalysis };
    },
  };
}

function envText(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

let partialWarning = false;

function warnIfHalfConfigured(endpoint, key) {
  if ((endpoint || key) && !(endpoint && key) && !partialWarning) {
    partialWarning = true;
    console.error(
      '[content-safety] Set both AZURE_CONTENT_SAFETY_ENDPOINT and AZURE_CONTENT_SAFETY_KEY, or neither. Checks are skipped.',
    );
  }
}

// Tests pass a client (or null to force a skip). Undefined means "use the environment".
let override;

/** @param {ReturnType<typeof createContentSafetyClient> | null | undefined} client */
export function setContentSafetyClient(client) {
  override = client;
}

function activeClient() {
  if (override !== undefined) return override;
  const endpoint = envText('AZURE_CONTENT_SAFETY_ENDPOINT');
  const key = envText('AZURE_CONTENT_SAFETY_KEY');
  if (!endpoint || !key) {
    warnIfHalfConfigured(endpoint, key);
    return null;
  }
  return createContentSafetyClient({ endpoint, key });
}

function textChunks(value) {
  const chunks = [];
  for (let i = 0; i < value.length; i += TEXT_LIMIT) chunks.push(value.slice(i, i + TEXT_LIMIT));
  return chunks;
}

/**
 * → { blocked, skipped? }
 * Skipped when the service is not configured or the text is empty.
 * Throws ContentSafetyError when the service is configured but cannot answer.
 */
export async function analyzeText(text) {
  const value = String(text ?? '').trim();
  if (!value) return { blocked: false, skipped: true };
  const client = activeClient();
  if (!client) return { blocked: false, skipped: true };
  for (const chunk of textChunks(value)) {
    const result = await client.analyzeText(chunk);
    if (result.blocked) return { blocked: true };
  }
  return { blocked: false };
}

/**
 * → { blocked, skipped? }
 * Skipped when the service is not configured.
 * Throws ContentSafetyError when the service is configured but cannot answer.
 */
export async function analyzeImage(filePath) {
  const client = activeClient();
  if (!client) return { blocked: false, skipped: true };
  return client.analyzeImage(filePath);
}
