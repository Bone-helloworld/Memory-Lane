/**
 * An error the API can show to the client.
 * `code` is a stable machine-readable string (e.g. 'INVALID_CREDENTIALS'); the browser translates it,
 * which keeps the server language-neutral and makes EN/VI a purely front-end concern.
 */
export class HttpError extends Error {
  constructor(status, code, fields) {
    super(code);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const notFound = () => new HttpError(404, 'NOT_FOUND');
