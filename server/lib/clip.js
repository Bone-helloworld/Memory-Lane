import path from 'node:path';
import sharp from 'sharp';
import labelsFile from './clip-labels.json' with { type: 'json' };
import { ROOT } from '../config.js';

/**
 * Zero-shot check for drawings the other two models miss (a painted sticker,
 * an illustrated poster). Only the CLIP vision tower is loaded here. The text
 * embeddings were computed once by scripts/clip-labels.mjs and committed next
 * to this file, so the text tower never enters the production process.
 *
 * Score: cosine similarity × 100, softmax over every label, then the sum of
 * the unsafe labels. Block when that sum is ≥ 0.15, or when the top label is
 * unsafe. The tower loads on the first upload (one shared promise) and stays
 * resident. fp16 on CPU, fp32 if fp16 cannot run.
 */

export const CLIP_MODEL = labelsFile.model;
export const CLIP_LOGIT_SCALE = labelsFile.logitScale;
export const CLIP_UNSAFE_MIN = 0.15;
export const CLIP_LABELS = labelsFile.labels;

const BAD = new Set(CLIP_LABELS.filter((label) => label.bad).map((label) => label.text));

export class ClipUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ClipUnavailableError';
    this.code = 'CLIP_UNAVAILABLE';
  }
}

export function softmax(logits) {
  let max = -Infinity;
  for (const value of logits) if (value > max) max = value;
  const exps = logits.map((value) => Math.exp(value - max));
  const sum = exps.reduce((total, value) => total + value, 0) || 1;
  return exps.map((value) => value / sum);
}

function dot(left, right) {
  let sum = 0;
  for (let i = 0; i < left.length; i += 1) sum += left[i] * right[i];
  return sum;
}

function normalize(vector) {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum) || 1;
  return Array.from(vector, (value) => value / norm);
}

/** probabilities aligned with CLIP_LABELS → { explicit, unsafe, top } */
export function clipVerdict(probabilities, labels = CLIP_LABELS) {
  let unsafe = 0;
  let top = 0;
  for (let i = 0; i < probabilities.length; i += 1) {
    if (labels[i].bad) unsafe += probabilities[i];
    if (probabilities[i] > probabilities[top]) top = i;
  }
  return {
    explicit: unsafe >= CLIP_UNSAFE_MIN || Boolean(labels[top].bad),
    unsafe,
    top: labels[top].text,
  };
}

/** Unit image embedding → label probabilities. */
export function clipProbabilities(imageEmbedding, labels = CLIP_LABELS, logitScale = CLIP_LOGIT_SCALE) {
  const vector = normalize(imageEmbedding);
  const logits = labels.map((label) => dot(vector, label.embedding) * logitScale);
  return softmax(logits);
}

export function isBadLabel(text) {
  return BAD.has(text);
}

function modelCacheDir() {
  return path.join(path.resolve(ROOT, process.env.DATA_DIR || 'data'), 'models');
}

// Tests pass a function. Undefined means "use the vision tower".
let override;

/** @param {((filePath: string) => Promise<{ explicit: boolean, unsafe?: number, top?: string }>) | undefined} fn */
export function setClipReviewer(fn) {
  override = fn;
}

let visionPromise = null;
let fp16Failed = false;

async function embedWith(session, filePath) {
  const { RawImage } = await import('@huggingface/transformers');
  // sharp, not RawImage.read: uploads are WebP, and a missing file must not be
  // mistaken for "fp16 cannot run".
  const { data, info } = await sharp(filePath, { failOn: 'error', animated: false, limitInputPixels: 60_000_000 })
    .rotate()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = new Uint8ClampedArray(data.byteLength);
  pixels.set(data);
  const image = new RawImage(pixels, info.width, info.height, 3);
  const inputs = await session.processor(image);
  const { image_embeds: imageEmbeds } = await session.vision(inputs);
  const width = imageEmbeds.dims[imageEmbeds.dims.length - 1];
  const embed = imageEmbeds.data;
  const start = embed.length - width;
  return clipProbabilities(embed.subarray(start, start + width));
}

async function smoke(processor, vision) {
  const { RawImage } = await import('@huggingface/transformers');
  const pixels = new Uint8ClampedArray(8 * 8 * 3);
  pixels.fill(128);
  const inputs = await processor(new RawImage(pixels, 8, 8, 3));
  await vision(inputs);
}

async function loadVision() {
  const { env, AutoProcessor, CLIPVisionModelWithProjection } = await import('@huggingface/transformers');
  env.allowRemoteModels = true;
  env.cacheDir = modelCacheDir();
  const processor = await AutoProcessor.from_pretrained(CLIP_MODEL);
  const dtype = fp16Failed ? 'fp32' : 'fp16';
  const vision = await CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, { dtype, device: 'cpu' });
  try {
    await smoke(processor, vision);
  } catch (err) {
    await vision.dispose?.();
    if (dtype === 'fp32') throw err;
    fp16Failed = true;
    console.error(
      `[${new Date().toISOString()}] CLIP fp16 cannot run (${err instanceof Error ? err.message : err}); using fp32`,
    );
    const fallback = await CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, { dtype: 'fp32', device: 'cpu' });
    await smoke(processor, fallback);
    console.log(`[${new Date().toISOString()}] CLIP vision tower ready (fp32)`);
    return { processor, vision: fallback, dtype: 'fp32' };
  }
  console.log(`[${new Date().toISOString()}] CLIP vision tower ready (${dtype})`);
  return { processor, vision, dtype };
}

function loadShared() {
  if (!visionPromise) {
    visionPromise = loadVision().catch((err) => {
      visionPromise = null;
      throw err;
    });
  }
  return visionPromise;
}

/** Loads the vision tower and keeps it. Safe to call more than once. */
export function warmClip() {
  return loadShared();
}

/**
 * → { explicit, unsafe, top }
 * Throws ClipUnavailableError when the tower cannot run. Callers must not store the file.
 */
export async function reviewClip(filePath) {
  if (override) return override(filePath);
  try {
    const session = await loadShared();
    const probabilities = await embedWith(session, filePath);
    return clipVerdict(probabilities);
  } catch (err) {
    if (err instanceof ClipUnavailableError || err?.code === 'CLIP_UNAVAILABLE') throw err;
    throw new ClipUnavailableError(err instanceof Error ? err.message : 'could not run the drawing check');
  }
}
