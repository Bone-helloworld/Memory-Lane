import fs from 'node:fs/promises';

/**
 * Photos and videos straight from a phone carry hidden metadata — very often the GPS position
 * where they were taken, which for family pictures usually means someone's home. Once memories
 * can be shared, that is a real leak, so every upload is cleaned here, on the server, whatever
 * the browser did first:
 *
 *   JPEG     drop the APP1 (EXIF, XMP) and APP13 (IPTC) segments
 *   PNG      drop the eXIf chunk and the text chunks (tEXt, zTXt, iTXt — XMP lives there)
 *   WebP     drop the EXIF and XMP chunks and clear their flags
 *   MP4/MOV  blank every ISO-6709 location ("+21.0285+105.8542/") in the movie header, byte for
 *            byte, so the file keeps its exact layout and every offset inside it stays valid
 *
 * The web app also re-draws photos on a canvas before uploading (see client/src/lib/image.js);
 * this is the safety net for everything else.
 */
export async function scrubMetadata(file, ext) {
  if (ext === 'mp4' || ext === 'mov') return blankVideoLocation(file);
  const clean = { jpg: stripJpeg, png: stripPng, webp: stripWebp }[ext];
  if (!clean) return false;
  const original = await fs.readFile(file);
  const cleaned = clean(original);
  if (cleaned === original) return false;
  await fs.writeFile(file, cleaned);
  return true;
}

// ---------- images ----------

export function stripJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return buf;
  const kept = [buf.subarray(0, 2)];
  let i = 2;
  let dropped = false;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return buf; // not where a marker should be: leave the file as it is
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xda || marker === 0xd9) {
      // Start of the image data (or its end): nothing after this point is metadata.
      kept.push(buf.subarray(i));
      return dropped ? Buffer.concat(kept) : buf;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      kept.push(buf.subarray(i, i + 2)); // markers without a length
      i += 2;
      continue;
    }
    const end = i + 2 + buf.readUInt16BE(i + 2);
    if (end > buf.length) return buf;
    if (marker === 0xe1 || marker === 0xed) dropped = true;
    else kept.push(buf.subarray(i, end));
    i = end;
  }
  return buf;
}

const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

export function stripPng(buf) {
  const kept = [buf.subarray(0, 8)];
  let i = 8;
  let dropped = false;
  while (i + 12 <= buf.length) {
    const length = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString('latin1');
    const end = i + 12 + length;
    if (end > buf.length) return buf;
    if (PNG_DROP.has(type)) dropped = true;
    else kept.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return dropped ? Buffer.concat(kept) : buf;
}

export function stripWebp(buf) {
  if (buf.subarray(0, 4).toString('latin1') !== 'RIFF' || buf.subarray(8, 12).toString('latin1') !== 'WEBP') return buf;
  const chunks = [];
  let i = 12;
  let dropped = false;
  while (i + 8 <= buf.length) {
    const type = buf.subarray(i, i + 4).toString('latin1');
    const size = buf.readUInt32LE(i + 4);
    const end = i + 8 + size + (size % 2); // chunks are padded to an even length
    if (end > buf.length) return buf;
    if (type === 'EXIF' || type === 'XMP ') dropped = true;
    else chunks.push(Buffer.from(buf.subarray(i, end)));
    i = end;
  }
  if (!dropped) return buf;
  const vp8x = chunks.find((chunk) => chunk.subarray(0, 4).toString('latin1') === 'VP8X');
  if (vp8x) vp8x[8] &= ~0x0c; // the "has EXIF" (0x08) and "has XMP" (0x04) flags
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(body.length + 4, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}

// ---------- videos ----------

// "+21.0285+105.8542/", "+21.0285+105.8542+012.345/", "-33.8688+151.2093+000.000/" …
const ISO6709 = /[+-]\d{2}(?:\.\d+)?[+-]\d{3}(?:\.\d+)?(?:[+-]\d+(?:\.\d+)?)?(?:CRS[\w:]+)?\//g;
const MAX_HEADER = 32 * 1024 * 1024;

/** Finds the top-level "moov" box (it holds all the metadata) and blanks location strings in it. */
export async function blankVideoLocation(file) {
  const handle = await fs.open(file, 'r+');
  try {
    const { size } = await handle.stat();
    const header = Buffer.alloc(16);
    let offset = 0;
    while (offset + 8 <= size) {
      await handle.read(header, 0, 16, offset);
      let boxSize = header.readUInt32BE(0);
      const type = header.subarray(4, 8).toString('latin1');
      let headerSize = 8;
      if (boxSize === 1) {
        boxSize = Number(header.readBigUInt64BE(8));
        headerSize = 16;
      } else if (boxSize === 0) {
        boxSize = size - offset; // the last box runs to the end of the file
      }
      if (boxSize < headerSize) return false; // corrupt: stop rather than guess
      if (type === 'moov') {
        if (boxSize > MAX_HEADER) return false;
        const moov = Buffer.alloc(boxSize);
        await handle.read(moov, 0, boxSize, offset);
        if (!blankLocations(moov)) return false;
        await handle.write(moov, 0, boxSize, offset);
        return true;
      }
      offset += boxSize;
    }
    return false;
  } finally {
    await handle.close();
  }
}

/** Replaces the digits of every ISO-6709 string with zeros, in place. → true if anything changed. */
export function blankLocations(buf) {
  const text = buf.toString('latin1');
  let changed = false;
  for (const match of text.matchAll(ISO6709)) {
    const blank = match[0].replace(/\d/g, '0');
    if (blank !== match[0]) {
      buf.write(blank, match.index, 'latin1');
      changed = true;
    }
  }
  return changed;
}
