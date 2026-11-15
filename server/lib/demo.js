/** Demo accounts live only on this domain. A reset is refused if a listed address is anything else. */
export const DEMO_EMAIL_SUFFIX = '@memorylane.local';

export function assertDemoEmails(emails) {
  if (!Array.isArray(emails) || emails.length === 0) {
    throw new Error('Refusing to reset demo data: no demo accounts were listed.');
  }
  for (const email of emails) {
    if (typeof email !== 'string' || !email.toLowerCase().endsWith(DEMO_EMAIL_SUFFIX)) {
      throw new Error(`Refusing to reset demo data: "${email}" is not a ${DEMO_EMAIL_SUFFIX} demo account.`);
    }
  }
}

/**
 * `email IN (?,?,…) AND email LIKE ?` — the IN list is the demo addresses, and the LIKE
 * pattern is `%@memorylane.local`. Both have to match, so a real account cannot be deleted
 * even if the address list were wrong.
 */
export function demoEmailWhere(count, column = 'email') {
  if (!Number.isInteger(count) || count < 1) throw new Error('Refusing to reset demo data: empty account list.');
  const marks = Array.from({ length: count }, () => '?').join(', ');
  return `${column} IN (${marks}) AND ${column} LIKE ?`;
}

/** The start command seeds only when the demo button is on. `ALLOW_DEMO=false` skips it. */
export function shouldSeedDemo(config) {
  return config.allowDemo === true;
}
