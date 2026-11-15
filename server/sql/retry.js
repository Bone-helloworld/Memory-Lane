/**
 * Azure SQL serverless pauses after about an hour with no traffic. The first connection
 * then waits while the database resumes — often close to a minute, sometimes a little longer.
 * Try again with a pause between attempts instead of failing the boot on that first timeout.
 */
export const SQL_CONNECT_DELAYS_MS = [0, 5_000, 15_000];

export async function connectWithRetry(connect, { delays = SQL_CONNECT_DELAYS_MS, sleep = defaultSleep, onError = () => {} } = {}) {
  let lastError;
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt] > 0) await sleep(delays[attempt]);
    try {
      return await connect();
    } catch (err) {
      lastError = err;
      onError(err, attempt);
    }
  }
  throw lastError;
}

/** A dropped connection while the database is resuming or failing over. Syntax errors are not retried. */
export function isTransientSqlError(err) {
  const text = `${err?.code ?? ''} ${err?.number ?? ''} ${err?.message ?? ''}`;
  return /ECONNCLOSED|ECONNRESET|ETIMEOUT|ESOCKET|ELOGIN|ENOTOPEN|EINSTLOOKUP|40613|40197|40501|4060|not currently available|Connection lost|Connection is closed|timeout expired/i.test(text);
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
