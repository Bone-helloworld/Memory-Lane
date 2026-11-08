// Guards the EN ⇄ VI translations: same keys, same {placeholders}, and every key the
// interface uses actually exists — so switching language can never show a raw key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import en from '../client/src/i18n/en.js';
import vi from '../client/src/i18n/vi.js';

const PLURAL_FORMS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const isPlural = (value) =>
  value !== null && typeof value === 'object' && 'other' in value && Object.keys(value).every((k) => PLURAL_FORMS.has(k));

/** Flatten { a: { b: 'x' } } → { 'a.b': 'x' }; plural objects count as one entry. */
function entries(dictionary, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(dictionary)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string' || isPlural(value)) out[name] = value;
    else Object.assign(out, entries(value, name));
  }
  return out;
}

const placeholders = (value) =>
  [...new Set((typeof value === 'string' ? [value] : Object.values(value)).flatMap((s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort();

const EN = entries(en);
const VI = entries(vi);

test('English and Vietnamese have exactly the same keys', () => {
  const missingInVi = Object.keys(EN).filter((key) => !(key in VI));
  const missingInEn = Object.keys(VI).filter((key) => !(key in EN));
  assert.deepEqual(missingInVi, [], 'keys missing in vi.js');
  assert.deepEqual(missingInEn, [], 'keys missing in en.js');
});

test('both languages use the same {placeholders}', () => {
  for (const key of Object.keys(EN)) {
    assert.deepEqual(placeholders(VI[key]), placeholders(EN[key]), `placeholders differ for "${key}"`);
  }
});

test('no translation is empty', () => {
  for (const [key, value] of [...Object.entries(EN), ...Object.entries(VI)]) {
    const texts = typeof value === 'string' ? [value] : Object.values(value);
    assert.ok(texts.every((text) => text.trim().length > 0), `empty translation for "${key}"`);
  }
});

test('every translation key used in the client exists', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'src');
  const files = fs.readdirSync(root, { recursive: true }).filter((file) => /\.jsx?$/.test(file) && !file.includes('i18n'));
  const namespaces = Object.keys(en).join('|');
  const pattern = new RegExp(`['"]((?:${namespaces})\\.[A-Za-z0-9_.]+)['"]`, 'g');

  const unknown = [];
  let checked = 0;
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const [, key] of source.matchAll(pattern)) {
      if (/\.(jsx?|css)$/.test(key)) continue; // import paths such as '../state.jsx'
      checked += 1;
      if (!(key in EN)) unknown.push(`${file}: ${key}`);
    }
  }
  assert.ok(checked > 200, `expected to find many keys, found ${checked}`);
  assert.deepEqual(unknown, []);
});

test('keys built at runtime exist too (tabs, themes, statuses, samples)', () => {
  const dynamic = [
    ...['today', 'album', 'people', 'sharing', 'archive', 'artifacts', 'timeline'].map((k) => `nav.tabs.${k}`),
    ...['notebook', 'darkroom'].flatMap((k) => [`theme.${k}`, `theme.${k}Desc`]),
    ...['pending', 'accepted', 'expired', 'revoked'].map((k) => `sharing.status.${k}`),
    ...['frame1', 'frame2', 'frame4', 'frame5', 'frame6'].map((k) => `landing.sample.${k}`),
    ...['one', 'two', 'three'].flatMap((k) => [`landing.principle.${k}Title`, `landing.principle.${k}Body`]),
    ...['memories', 'people', 'media'].map((k) => `hero.stats.${k}`),
    ...['NOT_CONFIGURED', 'LOGIN_FIRST', 'FAILED', 'CANCELLED', 'EMAIL_TAKEN', 'TAKEN', 'LINKED'].map((k) => `google.result.${k}`),
    ...['postcard', 'stamp', 'photo'].map((k) => `cards.kind.${k}`),
    ...['paper', 'darkroom'].map((k) => `cards.style.${k}`),
  ];
  assert.deepEqual(dynamic.filter((key) => !(key in EN)), []);
});

test('every error code the server can send has a message', () => {
  const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server');
  const source = fs
    .readdirSync(serverDir, { recursive: true })
    .filter((file) => file.endsWith('.js'))
    .map((file) => fs.readFileSync(path.join(serverDir, file), 'utf8'))
    .join('\n');
  const codes = new Set(['SERVER', 'NETWORK']);
  const fieldCodes = new Set();
  for (const [, code] of source.matchAll(/new HttpError\(\d+, '([A-Z_]+)'/g)) codes.add(code);
  for (const [, code] of source.matchAll(/\berror: '([A-Z_]+)'/g)) codes.add(code);
  for (const [, code] of source.matchAll(/\bfail\([^,]+, '([A-Z_]+)'/g)) fieldCodes.add(code);
  for (const [, code] of source.matchAll(/\bcode: '([A-Z_]+)'/g)) fieldCodes.add(code);
  assert.ok(codes.size > 10 && fieldCodes.size > 10, 'expected to find the server error codes');
  const missing = [
    ...[...codes].filter((code) => !(`errors.${code}` in EN)),
    ...[...fieldCodes].filter((code) => !(`errors.field.${code}` in EN)),
  ];
  assert.deepEqual(missing, []);
});
