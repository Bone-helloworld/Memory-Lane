// Tedious returns BIGINT as a string. The quota check adds that string to the
// upload size, so two photos look larger than the account limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sql from 'mssql';
import { coerceDriverValue, normalizeRows } from '../server/db/mssql-worker.js';

test('bigint and decimal digit strings become numbers only for those columns', () => {
  assert.equal(coerceDriverValue('2400000', { type: sql.BigInt }), 2400000);
  assert.equal(coerceDriverValue('-4', { type: sql.BigInt }), -4);
  assert.equal(coerceDriverValue(12n, { type: sql.BigInt }), 12);
  assert.equal(coerceDriverValue(12, { type: sql.BigInt }), 12);
  assert.equal(coerceDriverValue('15', { type: sql.Decimal }), 15);
  assert.equal(coerceDriverValue('8', { type: { name: 'BigInt' } }), 8);
  assert.equal(coerceDriverValue('8', { type: { name: 'Decimal' } }), 8);
  assert.equal(coerceDriverValue('8', { type: { name: 'Numeric' } }), 8);

  assert.equal(coerceDriverValue('2400000', { type: sql.NVarChar }), '2400000');
  assert.equal(coerceDriverValue('2400000', { type: sql.Int }), '2400000');
  assert.equal(coerceDriverValue('1999', { type: { name: 'NVarChar' } }), '1999');
  assert.equal(coerceDriverValue('2400000', undefined), '2400000');
  assert.equal(coerceDriverValue('12.5', { type: sql.Decimal }), '12.5');
  assert.equal(coerceDriverValue('12abc', { type: sql.BigInt }), '12abc');
  assert.equal(coerceDriverValue(null, { type: sql.BigInt }), null);

  const used = coerceDriverValue('1500000', { type: sql.BigInt });
  assert.equal(used + 800000, 2300000);

  const recordset = [{ n: '1500000', title: '1999' }];
  recordset.columns = { n: { type: sql.BigInt }, title: { type: sql.NVarChar } };
  assert.deepEqual(normalizeRows(recordset), [{ n: 1500000, title: '1999' }]);
  assert.deepEqual(normalizeRows(null), []);
});
