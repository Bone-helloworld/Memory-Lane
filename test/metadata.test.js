// Unit tests for file recognition (magic bytes) and metadata removal.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sniff } from '../server/lib/files.js';
import { blankLocations, stripJpeg, stripPng, stripWebp } from '../server/lib/metadata.js';

const bytes = (...parts) =>
  Buffer.concat(parts.map((part) => (typeof part === 'string' ? Buffer.from(part, 'latin1') : Buffer.from(part))));

function riffChunk(type, payload) {
  const size = Buffer.alloc(4);
  size.writeUInt32LE(payload.length, 0);
  return bytes(type, size, payload, payload.length % 2 ? [0] : []);
}

describe('sniff: what a file really is', () => {
  const pad = (buf) => Buffer.concat([buf, Buffer.alloc(16)]);
  test('images', () => {
    assert.deepEqual(sniff(pad(bytes([0xff, 0xd8, 0xff, 0xe0]))), { kind: 'image', ext: 'jpg' });
    assert.deepEqual(sniff(pad(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a]))), { kind: 'image', ext: 'png' });
    assert.deepEqual(sniff(pad(bytes('GIF89a'))), { kind: 'image', ext: 'gif' });
    assert.deepEqual(sniff(pad(bytes('RIFF', [0, 0, 0, 0], 'WEBP'))), { kind: 'image', ext: 'webp' });
  });

  test('videos, and HEIC photos that look like videos', () => {
    assert.deepEqual(sniff(pad(bytes([0, 0, 0, 24], 'ftypisom'))), { kind: 'video', ext: 'mp4' });
    assert.deepEqual(sniff(pad(bytes([0, 0, 0, 20], 'ftypqt  '))), { kind: 'video', ext: 'mov' });
    assert.deepEqual(sniff(pad(bytes([0x1a, 0x45, 0xdf, 0xa3]))), { kind: 'video', ext: 'webm' });
    assert.equal(sniff(pad(bytes([0, 0, 0, 24], 'ftypheic'))), null);
    assert.equal(sniff(pad(bytes([0, 0, 0, 24], 'ftypavif'))), null);
  });

  test('anything else', () => {
    assert.equal(sniff(pad(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))), null);
    assert.equal(sniff(pad(bytes('%PDF-1.7'))), null);
    assert.equal(sniff(bytes([0xff, 0xd8])), null, 'too short');
  });
});

describe('metadata removal', () => {
  test('JPEG: EXIF/XMP (APP1) and IPTC (APP13) go, everything else stays', () => {
    const app0 = bytes([0xff, 0xe0, 0x00, 0x07], 'JFIF\0');
    const exif = bytes([0xff, 0xe1, 0x00, 0x0a], 'Exif\0\0GP');
    const iptc = bytes([0xff, 0xed, 0x00, 0x05], 'PS3');
    const icc = bytes([0xff, 0xe2, 0x00, 0x06], 'ICC\0');
    const scan = bytes([0xff, 0xda, 0x00, 0x04, 1, 2], [0xe1, 0xff, 0x00, 0xed], [0xff, 0xd9]);
    const input = bytes([0xff, 0xd8], app0, exif, iptc, icc, scan);
    assert.deepEqual(stripJpeg(input), bytes([0xff, 0xd8], app0, icc, scan));

    const clean = bytes([0xff, 0xd8], app0, scan);
    assert.equal(stripJpeg(clean), clean, 'nothing to remove → the same buffer');
    const broken = bytes([0xff, 0xd8], [0xff, 0xe1, 0x40, 0x00], 'Exif');
    assert.equal(stripJpeg(broken), broken, 'a malformed file is left as it is');
  });

  test('PNG: eXIf and text chunks go', () => {
    const chunk = (type, data) => {
      const length = Buffer.alloc(4);
      length.writeUInt32BE(data.length, 0);
      return bytes(length, type, data, [0, 0, 0, 0]);
    };
    const signature = bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = chunk('IHDR', Buffer.alloc(13));
    const idat = chunk('IDAT', bytes('pixels'));
    const iend = chunk('IEND', Buffer.alloc(0));
    const input = bytes(signature, ihdr, chunk('eXIf', bytes('MM\0*GPS')), chunk('iTXt', bytes('XML:com.adobe.xmp')), idat, iend);
    assert.deepEqual(stripPng(input), bytes(signature, ihdr, idat, iend));
  });

  test('WebP: EXIF and XMP chunks go, flags and sizes are fixed', () => {
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0x08 | 0x04 | 0x10; // EXIF + XMP + alpha
    const image = riffChunk('VP8L', bytes('image-data!'));
    const body = bytes('WEBP', riffChunk('VP8X', vp8x), image, riffChunk('EXIF', bytes('GPS 21N')), riffChunk('XMP ', bytes('<x/>')));
    const size = Buffer.alloc(4);
    size.writeUInt32LE(body.length, 0);
    const out = stripWebp(bytes('RIFF', size, body));

    assert.equal(out.includes('EXIF'), false);
    assert.equal(out.includes('XMP '), false);
    assert.equal(out.readUInt32LE(4), out.length - 8, 'RIFF size matches the new length');
    assert.equal(out[20], 0x10, 'only the alpha flag is left');
    assert.ok(out.includes(image));
  });

  test('videos: every ISO-6709 location is blanked in place, nothing else changes', () => {
    const input = bytes('\xa9xyz\0\0+21.0285+105.8542/ keys ISO6709 -33.8688+151.2093+012.500/ 12+34');
    const copy = Buffer.from(input);
    assert.equal(blankLocations(copy), true);
    assert.equal(copy.length, input.length);
    assert.equal(copy.toString('latin1'), '\xa9xyz\0\0+00.0000+000.0000/ keys ISO6709 -00.0000+000.0000+000.000/ 12+34');
    assert.equal(blankLocations(bytes('no location here')), false);
  });
});
