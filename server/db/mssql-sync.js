import { MessageChannel, Worker, receiveMessageOnPort } from 'node:worker_threads';
import { createMssqlDb } from './mssql-db.js';

const CONNECT_TIMEOUT_MS = 240_000;
const QUERY_TIMEOUT_MS = 120_000;

/**
 * Opens Azure SQL and blocks until the pool is connected and the schema is in place.
 * Later prepare/get/all/run calls block the same way node:sqlite does, one at a time.
 */
export function openAzureDatabase(config) {
  const worker = new Worker(new URL('./mssql-worker.js', import.meta.url));
  const call = (op, payload, timeoutMs) => callWorker(worker, op, payload, timeoutMs);
  try {
    call('init', { config }, CONNECT_TIMEOUT_MS);
    const db = createMssqlDb({
      query: (sql, params) => call('query', { sql, params }, QUERY_TIMEOUT_MS),
      begin: () => call('begin', {}, QUERY_TIMEOUT_MS),
      commit: () => call('commit', {}, QUERY_TIMEOUT_MS),
      rollback: () => call('rollback', {}, 30_000),
    });
    const closeDb = db.close;
    db.close = () => {
      try {
        call('close', {}, 20_000);
      } catch {
        // The pool may already be gone.
      }
      closeDb();
      return worker.terminate();
    };
    return db;
  } catch (err) {
    worker.terminate();
    throw err;
  }
}

function callWorker(worker, op, payload, timeoutMs) {
  const shared = new Int32Array(new SharedArrayBuffer(4));
  const { port1, port2 } = new MessageChannel();
  worker.postMessage({ op, ...payload, shared, port: port2 }, [port2]);
  const status = Atomics.wait(shared, 0, 0, timeoutMs);
  const received = receiveMessageOnPort(port1);
  port1.close();
  if (!received) {
    const waited = status === 'timed-out' ? ` after ${Math.round(timeoutMs / 1000)}s` : '';
    throw new Error(
      `Azure SQL did not answer${waited}. A paused serverless database can take about a minute to resume.`,
    );
  }
  const message = received.message;
  if (!message.ok) {
    const error = new Error(message.message || 'Azure SQL request failed');
    error.number = message.number;
    error.code = message.code;
    if (message.errcode) error.errcode = message.errcode;
    throw error;
  }
  return message.result;
}
