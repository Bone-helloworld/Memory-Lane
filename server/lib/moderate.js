import sharp from 'sharp';

/**
 * Decides whether a photo is too explicit to keep.
 *
 * sharp cannot tell a nude photo from a landscape, so this asks nsfwjs:
 * a small MobileNetV2 model that runs inside Node on the CPU build of
 * TensorFlow.js (not the native tfjs-node build, which is far too heavy
 * for a small host). The weights ship inside the nsfwjs
 * package (~4 MB). They are loaded the first time someone uploads a photo
 * or a video, not when the server boots, so a cold start stays a normal Node start.
 * After that the model stays in memory for the life of the process.
 *
 * Fail closed. If the model cannot load, or the check throws, the photo
 * is refused and nothing is stored. A family album should not keep a
 * picture we failed to look at. The next upload tries to load the model
 * again.
 *
 * What we refuse (names are the model's own classes):
 *   Porn   ≥ 0.60
 *   Hentai ≥ 0.60
 *   Sexy   ≥ 0.85 and Neutral < 0.20
 * "Sexy" on its own is often a beach photo. Those stay.
 *
 * Videos are sampled by server/lib/videoCheck.js (a few small frames via ffmpeg).
 * Each frame is passed to reviewImage below, one at a time.
 */

export const EXPLICIT_THRESHOLDS = {
  porn: 0.6,
  hentai: 0.6,
  sexy: 0.85,
  sexyNeutralBelow: 0.2,
};

/** predictions: [{ className, probability }, …] from nsfwjs. */
export function isExplicit(predictions) {
  const score = Object.fromEntries(predictions.map((row) => [row.className, row.probability]));
  if ((score.Porn ?? 0) >= EXPLICIT_THRESHOLDS.porn) return true;
  if ((score.Hentai ?? 0) >= EXPLICIT_THRESHOLDS.hentai) return true;
  if ((score.Sexy ?? 0) >= EXPLICIT_THRESHOLDS.sexy && (score.Neutral ?? 1) < EXPLICIT_THRESHOLDS.sexyNeutralBelow) {
    return true;
  }
  return false;
}

// Tests pass a function. Undefined means "use the real model".
let override;

let modelPromise = null;

/** @param {((filePath: string) => Promise<{ explicit: boolean }>) | undefined} fn */
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

/**
 * → { explicit: boolean }
 * Throws when the model cannot run. Callers must not store the photo.
 */
export async function reviewImage(filePath) {
  if (override) return override(filePath);
  const model = await loadModel();
  const tensor = await tensorFromFile(filePath);
  try {
    const predictions = await model.classify(tensor);
    return { explicit: isExplicit(predictions) };
  } finally {
    tensor.dispose();
  }
}
