import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { LIMITS } from '../../shared/limits.js';
import { analyzeImage } from './content-safety.js';
import { reviewClip } from './clip.js';
import { scoreImage } from './moderate.js';

/**
 * Looks at stills from an uploaded video and refuses it when any still is explicit.
 *
 * The video file itself is not recompressed. ffmpeg, the binary shipped in the
 * `ffmpeg-static` package, pulls out JPEGs. nsfwjs scores every frame. CLIP's
 * vision tower scores every frame too (drawings that look "neutral" to nsfwjs).
 * Azure Content Safety, when it is configured, sees at most four of them — the
 * ones nsfwjs found most suspicious — because the free tier is quota-limited.
 *
 * How many frames: eight, spread across the clip, and never sparser than one
 * every 10 seconds. A 10-minute video would be 60 frames at that pace, so the
 * sample is capped at 12 and those 12 are spread across the whole video.
 *
 * Fail closed. If ffmpeg is missing, the file has no readable duration, a frame
 * cannot be decoded, or either checker throws, the video is not stored.
 */

export const TARGET_FRAMES = 8;
export const FRAME_EVERY_SEC = 10;
export const MAX_FRAMES = 12;
export const CONTENT_SAFETY_FRAMES = 4;

// Tests pass a function. Undefined means "use ffmpeg + the image checker".
let override;

/** @param {((filePath: string) => Promise<{ explicit: boolean }>) | undefined} fn */
export function setVideoReviewer(fn) {
  override = fn;
}

/**
 * Seconds at which to grab a frame. `durationSec` is the length ffmpeg reported.
 * → [number], length between 1 and MAX_FRAMES, or [] when the duration is unusable.
 */
export function frameTimestamps(durationSec) {
  const duration = Number(durationSec);
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const byRate = Math.ceil(duration / FRAME_EVERY_SEC);
  const count = Math.max(1, Math.min(MAX_FRAMES, Math.max(TARGET_FRAMES, byRate)));
  const step = duration / count;
  const times = [];
  for (let i = 0; i < count; i += 1) {
    const at = Math.min(Math.max(0, duration - 0.05), step * i + step / 2);
    times.push(Math.round(at * 1000) / 1000);
  }
  return times;
}

/**
 * The frames Content Safety should see: the highest nsfwjs suspicion, at most
 * `max`, keeping earlier frames when the scores tie.
 */
export function contentSafetyFrames(frames, max = CONTENT_SAFETY_FRAMES) {
  return frames
    .map((frame, index) => ({ ...frame, index }))
    .sort((a, b) => (b.suspicion ?? 0) - (a.suspicion ?? 0) || a.index - b.index)
    .slice(0, max);
}

function runFfmpeg(args, { allowFail = false, timeoutMs = 30_000 } = {}) {
  if (!ffmpegPath) return Promise.reject(new Error('ffmpeg binary is missing'));
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('ffmpeg timed out'));
    }, timeoutMs);
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 80_000) stderr = stderr.slice(-40_000);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 || allowFail) resolve(stderr);
      else reject(new Error(`ffmpeg exited ${code}`));
    });
  });
}

/** Seconds, from the "Duration:" line ffmpeg prints. null when the file cannot be read. */
export async function probeDuration(filePath) {
  // `-i` with no output exits non-zero after printing the header. It does not decode the video.
  const stderr = await runFfmpeg(['-i', filePath], { allowFail: true, timeoutMs: 15_000 });
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function extractFrame(filePath, seconds, dest) {
  await runFfmpeg(
    [
      '-ss',
      seconds.toFixed(3),
      '-i',
      filePath,
      '-frames:v',
      '1',
      '-vf',
      'scale=1024:1024:force_original_aspect_ratio=decrease',
      '-q:v',
      '5',
      '-y',
      dest,
    ],
    { timeoutMs: 20_000 },
  );
}

/**
 * → { explicit: boolean }
 * Throws when the video cannot be checked. Callers must not store it.
 * A file longer than the album's limit throws `{ code: 'VIDEO_TOO_LONG', max }` (minutes).
 */
export async function reviewVideo(filePath) {
  if (override) return override(filePath);
  const duration = await probeDuration(filePath);
  if (duration == null) throw new Error('could not read the video duration');
  if (duration > LIMITS.videoMaxSeconds) {
    const err = new Error('VIDEO_TOO_LONG');
    err.code = 'VIDEO_TOO_LONG';
    err.max = Math.round(LIMITS.videoMaxSeconds / 60);
    throw err;
  }
  const times = frameTimestamps(duration);
  if (times.length === 0) throw new Error('no frames to check');

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ml-frames-'));
  try {
    const scored = [];
    for (let i = 0; i < times.length; i += 1) {
      const frame = path.join(dir, `frame-${i}.jpg`);
      await extractFrame(filePath, times[i], frame);
      const verdict = await scoreImage(frame);
      // One explicit frame is enough. The rest are not scored, and Azure is not called.
      if (verdict.explicit) return { explicit: true };
      scored.push({ frame, suspicion: verdict.suspicion ?? 0 });
    }
    for (const row of scored) {
      const clip = await reviewClip(row.frame);
      if (clip.explicit) return { explicit: true };
    }
    for (const pick of contentSafetyFrames(scored)) {
      const safety = await analyzeImage(pick.frame);
      if (safety.skipped) break;
      if (safety.blocked) return { explicit: true };
    }
    return { explicit: false };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
