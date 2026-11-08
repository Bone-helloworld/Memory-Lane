import { ApiError } from '../api.js';

/**
 * Uploads one photo or video to a memory with progress reporting. fetch() cannot report
 * upload progress yet, so this one request uses XMLHttpRequest. Same cookie, same origin,
 * same JSON error format as every other call (see api.js).
 */
export function uploadFile(memoryId, prepared, options) {
  return uploadTo(`/api/memories/${memoryId}/files`, prepared, options);
}

/**
 * The same upload, to any endpoint that takes `file` + `poster`. `fields` adds form fields — e.g. a
 * keepsake card saved to the Artifacts tab sends its kind, style and the text written on it.
 */
export function uploadTo(url, { file, preview, width, height, duration, fields = {} }, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    if (width) form.set('width', String(width));
    if (height) form.set('height', String(height));
    if (duration) form.set('duration', String(duration));
    for (const [name, value] of Object.entries(fields)) form.set(name, String(value ?? ''));
    form.set('file', file, file.name);
    if (preview) form.set('poster', preview, preview.type === 'image/webp' ? 'preview.webp' : 'preview.jpg');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'json';
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      const data = xhr.response ?? {};
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data.error ?? 'SERVER', data.fields, data.ref));
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}
