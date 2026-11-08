import { makePreview } from './image.js';

// Videos are uploaded as they are (re-encoding video in the browser is slow), but first the
// browser measures them and takes a still frame: the poster shown before playing and in grids.
// If the browser cannot decode the format (e.g. some iPhone HEVC .mov files on Windows),
// the upload still works — just without a poster or duration.

function once(target, event, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    target.addEventListener(
      event,
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    target.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(new Error('decode'));
      },
      { once: true },
    );
  });
}

/** → { width, height, duration, poster } (any of them may be null). */
export async function readVideo(file) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  const info = { width: null, height: null, duration: null, poster: null };
  try {
    video.src = url;
    await once(video, 'loadedmetadata', 10_000);
    info.width = video.videoWidth || null;
    info.height = video.videoHeight || null;
    info.duration = Number.isFinite(video.duration) ? Math.round(video.duration * 100) / 100 : null;

    // A frame a little way in is more telling than a black first frame.
    video.currentTime = Math.min(1, Math.max(0.05, (video.duration || 1) * 0.1));
    await once(video, 'seeked', 10_000);
    if (video.videoWidth) info.poster = await makePreview(video, video.videoWidth, video.videoHeight);
  } catch {
    // Not decodable here: upload without poster/duration.
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
  return info;
}
