// The vision tower is not loaded here. These tests use the committed label vectors
// and the same softmax the upload path uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIP_LABELS,
  CLIP_LOGIT_SCALE,
  CLIP_UNSAFE_MIN,
  clipProbabilities,
  clipVerdict,
  softmax,
} from '../server/lib/clip.js';

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

test('the committed label file is the drawing set, each vector one unit long', () => {
  assert.equal(CLIP_LOGIT_SCALE, 100);
  assert.deepEqual(
    CLIP_LABELS.filter((label) => label.bad).map((label) => label.text),
    BAD,
  );
  assert.deepEqual(
    CLIP_LABELS.filter((label) => !label.bad).map((label) => label.text),
    GOOD,
  );
  for (const label of CLIP_LABELS) {
    assert.equal(label.embedding.length, 512, label.text);
    let sum = 0;
    for (const value of label.embedding) sum += value * value;
    assert.ok(Math.abs(sum - 1) < 1e-3, `${label.text} norm ${sum}`);
  }
});

test('softmax is a distribution, and 0.15 unsafe or a top unsafe label blocks', () => {
  const even = softmax([0, 0]);
  assert.ok(Math.abs(even[0] + even[1] - 1) < 1e-9);
  const labels = [
    { text: 'bad', bad: true },
    { text: 'good', bad: false },
  ];
  assert.equal(clipVerdict([0.14, 0.86], labels).explicit, false);
  assert.equal(clipVerdict([CLIP_UNSAFE_MIN, 1 - CLIP_UNSAFE_MIN], labels).explicit, true);
  assert.equal(clipVerdict([0.6, 0.4], labels).top, 'bad');
  assert.equal(clipVerdict([0.6, 0.4], labels).explicit, true);
});

test('an image embedding that matches an unsafe label is refused', () => {
  const penis = CLIP_LABELS[0];
  const verdict = clipVerdict(clipProbabilities(penis.embedding));
  assert.equal(verdict.top, penis.text);
  assert.equal(verdict.explicit, true);
  assert.ok(verdict.unsafe >= CLIP_UNSAFE_MIN);

  const street = CLIP_LABELS.find((label) => label.text === 'a street with motorbikes');
  const safe = clipVerdict(clipProbabilities(street.embedding));
  assert.equal(safe.top, street.text);
  assert.equal(safe.explicit, false);
  assert.ok(safe.unsafe < CLIP_UNSAFE_MIN);
});
