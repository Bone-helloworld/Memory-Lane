/**
 * Builds server/lib/clip-labels.json.
 *
 * Runs the CLIP text tower once (fp32), L2-normalizes each label, and writes the
 * vectors. Production loads only the vision tower and dots these vectors with the
 * image embedding. Re-run with `npm run clip-labels` when the label list changes.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, AutoTokenizer, CLIPTextModelWithProjection } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/clip-vit-base-patch32';
const BAD = [
  'a picture of a penis',
  'a drawing of penises',
  'a picture of a vulva',
  'a picture of naked breasts',
  'a nude person',
  'a sex scene',
];
const GOOD = [
  'a street with motorbikes',
  'a landscape or nature scene',
  'a photo of people',
  'a selfie',
  'a group of friends',
  'food',
  'a pet or animal',
  'a building',
  'a screenshot',
  'a document with text',
  'an artwork or painting',
  'a poster with text',
  'a cartoon',
  'an everyday object',
  'a vegetable or fruit',
  'a sausage',
  'a hand or finger',
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'server', 'lib', 'clip-labels.json');

env.allowRemoteModels = true;
env.cacheDir = path.join(root, 'data', 'models');

function rows(tensor) {
  const width = tensor.dims[tensor.dims.length - 1];
  const data = tensor.data;
  const outRows = [];
  for (let i = 0; i < data.length; i += width) {
    outRows.push(Array.from(data.subarray(i, i + width)));
  }
  return outRows;
}

function normalize(vector) {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum) || 1;
  return vector.map((value) => Math.round((value / norm) * 1e8) / 1e8);
}

const labels = [...BAD.map((text) => ({ text, bad: true })), ...GOOD.map((text) => ({ text, bad: false }))];
const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);
const textModel = await CLIPTextModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'fp32', device: 'cpu' });
const inputs = tokenizer(
  labels.map((label) => label.text),
  { padding: true, truncation: true },
);
const { text_embeds: textEmbeds } = await textModel(inputs);
const vectors = rows(textEmbeds).map(normalize);
if (vectors.length !== labels.length) {
  throw new Error(`expected ${labels.length} embeddings, got ${vectors.length}`);
}

const payload = {
  model: MODEL_ID,
  logitScale: 100,
  labels: labels.map((label, index) => ({ ...label, embedding: vectors[index] })),
};
writeFileSync(out, `${JSON.stringify(payload)}\n`);
console.log(`wrote ${labels.length} labels (${vectors[0].length} dims) to ${out}`);
await textModel.dispose?.();
