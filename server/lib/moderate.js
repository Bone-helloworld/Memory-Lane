import sharp from 'sharp';
import { reviewClip } from './clip.js';
import { analyzeImage } from './content-safety.js';

/**
 * Decides whether a photo is too explicit to keep.
 *
 * Three checks, and any one of them can refuse the file:
 *   - nsfwjs, a small MobileNetV2 model that runs inside Node on the CPU build
 *     of TensorFlow.js (not the native tfjs-node build, which is far too heavy
 *     for a small host). The weights ship inside the nsfwjs package (~4 MB).
 *     They are loaded the first time someone uploads a photo or a video, not
 *     when the server boots. After that the model stays in memory.
 *   - Azure AI Content Safety, when AZURE_CONTENT_SAFETY_ENDPOINT and
 *     AZURE_CONTENT_SAFETY_KEY are set (see content-safety.js). It is skipped
 *     locally. When it is configured and cannot answer, the error is left for
 *     the route to turn into "could not verify, try again".
 *   - CLIP's vision tower (see clip.js), for drawings nsfwjs and Azure both
 *     score as ordinary pictures. It loads on the first upload and stays
 *     loaded. If it cannot load, the upload is refused.
 *
 * nsfwjs runs first. A photo it already refuses is not sent to Azure or CLIP.
 * A photo both of those allow is still refused when CLIP flags a drawing.
 * Azure is skipped when it is not configured. CLIP is not.
 *
 * Fail closed for the local model too. If it cannot load, or the check throws,
 * the photo is refused and nothing is stored.
 *
 * What nsfwjs refuses (names are the model's own classes):
 *   Porn   ≥ 0.35
 *   Hentai ≥ 0.40
 *   Sexy   ≥ 0.60 and Neutral < 0.35
 *   Porn + Hentai + Sexy ≥ 0.75
 *
 * Videos are sampled by server/lib/videoCheck.js. Each frame is scored here;
 * only the most suspicious frames are sent to Content Safety.
 */

export const EXPLICIT_THRESHOLDS = {
  porn: 0.35,
  hentai: 0.4,
  sexy: 0.6,
  sexyNeutralBelow: 0.35,
  combined: 0.75,
};

function scoresOf(predictions) {
  const score = {};
  for (const row of predictions ?? []) score[row.className] = row.probability ?? 0;
  return score;
}

/** Porn + Hentai + Sexy. Video sampling uses this to pick frames for Content Safety. */
export function suspicionScore(predictions) {
  const score = scoresOf(predictions);
  return (score.Porn ?? 0) + (score.Hentai ?? 0) + (score.Sexy ?? 0);
}

/** predictions: [{ className, probability }, …] from nsfwjs. */
export function isExplicit(predictions) {
  const score = scoresOf(predictions);
  const porn = score.Porn ?? 0;
  const hentai = score.Hentai ?? 0;
  const sexy = score.Sexy ?? 0;
  if (porn >= EXPLICIT_THRESHOLDS.porn) return true;
  if (hentai >= EXPLICIT_THRESHOLDS.hentai) return true;
  if (sexy >= EXPLICIT_THRESHOLDS.sexy && (score.Neutral ?? 1) < EXPLICIT_THRESHOLDS.sexyNeutralBelow) return true;
  if (porn + hentai + sexy >= EXPLICIT_THRESHOLDS.combined) return true;
  return false;
}

// Tests pass a function. Undefined means "use the real model".
let override;

let modelPromise = null;

/** @param {((filePath: string) => Promise<{ explicit: boolean, suspicion?: number }>) | undefined} fn */
export function setImageReviewer(fn) {
  override = fn;
}

async function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      // CPU only. The native TensorFlow binding needs more RAM than this host has.
      await import('@tensorflow/tfjs-backend-cpu');
      const tf = await import('@tensorflow/tfjs');
      await tf.setBackend('cpu');
      await tf.ready();
      const nsfw = await import('nsfwjs');
      return nsfw.load('MobileNetV2');
    })().catch((err) => {
      modelPromise = null;
      throw err;
    });
  }
  return modelPromise;
}

async function tensorFromFile(filePath) {
  const tf = await import('@tensorflow/tfjs');
  // Stretched to 224×224, which is how this model was trained (it resizes the same way).
  const { data, info } = await sharp(filePath, { failOn: 'error', animated: false, limitInputPixels: 60_000_000 })
    .rotate()
    .resize(224, 224, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3]);
}

async function classify(filePath) {
  const model = await loadModel();
  const tensor = await tensorFromFile(filePath);
  try {
    const predictions = await model.classify(tensor);
    return { explicit: isExplicit(predictions), suspicion: suspicionScore(predictions) };
  } finally {
    tensor.dispose();
  }
}

/**
 * nsfwjs already ran. Azure runs when it is configured, then CLIP. Any one of
 * them refusing the photo is enough.
 * → { explicit, suspicion }
 * Throws when Azure is configured but silent, or when CLIP cannot run.
 */
export async function applyImageSafety(filePath, scored) {
  const suspicion = scored?.suspicion ?? 0;
  if (scored?.explicit) return { explicit: true, suspicion };
  const safety = await analyzeImage(filePath);
  if (safety.blocked) return { explicit: true, suspicion };
  const clip = await reviewClip(filePath);
  return { explicit: Boolean(clip.explicit), suspicion };
}

/**
 * → { explicit: boolean }
 * Throws when the check cannot run. Callers must not store the photo.
 */
export async function reviewImage(filePath) {
  if (override) return override(filePath);
  return applyImageSafety(filePath, await classify(filePath));
}

/**
 * nsfwjs only, for video frames. Content Safety is applied afterwards to a few
 * of them (see videoCheck.js), not to every frame.
 * → { explicit, suspicion }
 */
export async function scoreImage(filePath) {
  if (override) {
    const verdict = await override(filePath);
    const suspicion = Number(verdict?.suspicion);
    return {
      explicit: Boolean(verdict?.explicit),
      suspicion: Number.isFinite(suspicion) ? suspicion : verdict?.explicit ? 1 : 0,
    };
  }
  return classify(filePath);
}
