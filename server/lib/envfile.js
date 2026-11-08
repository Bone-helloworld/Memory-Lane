// Small helpers for the .env file (used by `npm run setup:google`).

/** Does this look like the Client ID of a Google OAuth client? ("1234-abc.apps.googleusercontent.com") */
export const isGoogleClientId = (value) => /^[\w.-]+\.apps\.googleusercontent\.com$/.test(value);

/**
 * Sets KEY=value in the text of a .env file: replaces the line that sets KEY — or the commented-out
 * "# KEY=…" example from .env.example — and appends the line when there is neither.
 * Every other line stays exactly as it was.
 */
export function setEnvValue(text, key, value) {
  const line = `${key}=${value}`;
  const existing = new RegExp(`^[ \\t]*#?[ \\t]*${key}=.*$`, 'm');
  if (existing.test(text)) return text.replace(existing, () => line);
  return `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`;
}
