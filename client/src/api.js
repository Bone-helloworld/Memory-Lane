/**
 * The only place that talks to the server. Every call:
 *  - sends the session cookie (same origin, httpOnly — JavaScript never sees it),
 *  - turns error responses into ApiError { status, code, fields } so pages can
 *    show translated messages ("errors.INVALID_CREDENTIALS") instead of raw server text.
 */
export class ApiError extends Error {
  constructor(status, code, fields, ref) {
    super(code);
    this.status = status;
    this.code = code;
    this.fields = fields ?? {};
    this.ref = ref ?? null; // an unexpected server error: the reference of its line in the server log
  }
}

let onUnauthorized = () => {};

/** Called when a request answers 401 (session expired, logged out elsewhere…). */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

async function request(method, path, body, { signal } = {}) {
  const init = { method, credentials: 'same-origin', signal, headers: { Accept: 'application/json' } };
  if (body instanceof FormData) {
    init.body = body; // the browser sets the multipart boundary itself
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(path, init);
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK');
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) onUnauthorized();
    throw new ApiError(response.status, data.error ?? 'SERVER', data.fields, data.ref);
  }
  return data;
}

export const api = {
  get: (path, options) => request('GET', path, undefined, options),
  post: (path, body, options) => request('POST', path, body, options),
  put: (path, body, options) => request('PUT', path, body, options),
  patch: (path, body, options) => request('PATCH', path, body, options),
  del: (path, body, options) => request('DELETE', path, body, options),
};

/** Translated, human message for any error thrown by api.*. */
export function errorMessage(t, error) {
  if (!(error instanceof ApiError)) return t('errors.SERVER');
  const message = t(`errors.${error.code}`);
  // "… Mã lỗi: 3f9a1c2e." — something to quote when reporting the problem (docs: PLAN.md, Phần C).
  return error.ref ? `${message} ${t('errors.ref', { ref: error.ref })}` : message;
}
