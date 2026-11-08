// Keepsake cards ("thẻ kỷ niệm"): a postcard, a stamp or a photo card made from one memory.
// Drawn on a <canvas> in the browser and saved as an image. Nothing leaves the device unless the owner
// keeps the card in the Artifacts tab ("Lưu vào Kỷ vật") — then the image is uploaded, privately.
// Sizes are print-friendly: 1800×1200 is a 6×4 in postcard at 300 dpi.

import { CARD_KINDS, CARD_STYLES } from '@shared/limits.js';

// One list for the browser and the server (which checks a kept card's kind and style).
export { CARD_KINDS, CARD_STYLES };
export const CARD_SIZES = { postcard: [1800, 1200], stamp: [1200, 1500], photo: [1200, 1500] };

/** A short, safe file name: "memory-lane-da-lat-postcard.jpg". */
export function cardFileName(title, kind) {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `memory-lane-${slug || 'memory'}-${kind}.jpg`;
}

const FONTS = {
  hand: '"Playpen Sans Variable", "Segoe Print", cursive',
  body: '"Be Vietnam Pro", system-ui, sans-serif',
  display: '"Bricolage Grotesque Variable", system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
};

const PALETTES = {
  paper: { bg: '#efe6d2', card: '#fffdf8', ink: '#24211c', soft: '#6f6658', accent: '#2547a6', mark: '#c2453a', line: 'rgba(36,33,28,0.16)', grain: 'rgba(120,96,60,0.07)', stamp: '#fffdf8' },
  darkroom: { bg: '#100f0e', card: '#1b1916', ink: '#efe9dd', soft: '#a49c8e', accent: '#e0483a', mark: '#e0483a', line: 'rgba(239,233,221,0.18)', grain: 'rgba(255,255,255,0.035)', stamp: '#2a2722' },
};

// The soft colour fields that stand in for a missing photo (same as --scene1…5 in the CSS).
const SCENES = {
  1: [[0.28, 0.3, 'rgba(233,180,92,0.55)'], [0.72, 0.74, 'rgba(102,160,150,0.4)']],
  2: [[0.7, 0.28, 'rgba(120,160,214,0.5)'], [0.26, 0.76, 'rgba(240,200,120,0.45)']],
  3: [[0.34, 0.34, 'rgba(236,140,140,0.45)'], [0.74, 0.7, 'rgba(250,210,120,0.45)']],
  4: [[0.3, 0.7, 'rgba(140,180,120,0.5)'], [0.72, 0.3, 'rgba(200,170,120,0.4)']],
  5: [[0.66, 0.34, 'rgba(232,120,90,0.42)'], [0.3, 0.72, 'rgba(255,210,110,0.5)']],
};

/** Waits for the card fonts — including the Vietnamese glyphs of `text` — so the first drawing is right. */
export async function loadCardFonts(text = '') {
  const sample = `${text} Memory Lane ăâđêôơư`;
  const fonts = [`500 64px ${FONTS.hand}`, `600 40px ${FONTS.body}`, `700 64px ${FONTS.display}`, `500 28px ${FONTS.mono}`];
  await Promise.all(fonts.map((font) => document.fonts.load(font, sample).catch(() => [])));
}

/** A same-origin photo (from /api/files), decoded and ready to draw. */
export async function loadCardImage(src) {
  if (!src) return null;
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

// ---------- drawing helpers ----------

/** Draws an image filling the box, cropped in the middle (CSS object-fit: cover). */
function cover(ctx, image, x, y, w, h) {
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

/** The photo, or the memory's colour field when there is none. */
function photoOrScene(ctx, image, scene, x, y, w, h) {
  if (image) return cover(ctx, image, x, y, w, h);
  ctx.fillStyle = '#fbf7ee';
  ctx.fillRect(x, y, w, h);
  for (const [cx, cy, color] of SCENES[scene] ?? SCENES[1]) {
    const gradient = ctx.createRadialGradient(x + cx * w, y + cy * h, 0, x + cx * w, y + cy * h, Math.max(w, h) * 0.6);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, h);
  }
}

/** Splits text into lines no wider than maxWidth (keeps the author's line breaks). */
function wrap(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text ?? '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Sets the largest font (from `size` down to `min`) at which `text` fits in maxWidth. */
function fit(ctx, text, maxWidth, { size, min, weight = 500, family }) {
  let s = size;
  for (; s > min; s -= 2) {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
  }
  ctx.font = `${weight} ${s}px ${family}`;
  return s;
}

/** A fixed sprinkle of paper grain (the same pattern every time, so previews do not flicker). */
function grain(ctx, w, h, color, count) {
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) ctx.fillRect(random() * w, random() * h, 2, 2);
}

function withShadow(ctx, draw, { blur = 46, y = 22, color = 'rgba(30,22,10,0.28)' } = {}) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = y;
  draw();
  ctx.restore();
}

/** A rectangle with stamp perforations punched along its edges, on its own canvas. */
function perforated(w, h, radius, gap, fill) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  for (let x = gap / 2; x < w; x += gap) {
    ctx.moveTo(x + radius, 0);
    ctx.arc(x, 0, radius, 0, Math.PI * 2);
    ctx.moveTo(x + radius, h);
    ctx.arc(x, h, radius, 0, Math.PI * 2);
  }
  for (let y = gap / 2; y < h; y += gap) {
    ctx.moveTo(radius, y);
    ctx.arc(0, y, radius, 0, Math.PI * 2);
    ctx.moveTo(w + radius, y);
    ctx.arc(w, y, radius, 0, Math.PI * 2);
  }
  ctx.fill();
  return canvas;
}

/** A round postmark: two rings, the brand on top, the date across, wavy cancellation lines. */
function postmark(ctx, cx, cy, r, color, { top, middle, bottom }) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.18);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.82;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r - 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fit(ctx, top, r * 1.5, { size: 22, min: 14, weight: 600, family: FONTS.mono });
  ctx.fillText(top, 0, -r * 0.45);
  fit(ctx, middle, r * 1.7, { size: 30, min: 16, weight: 600, family: FONTS.mono });
  ctx.fillText(middle, 0, 4);
  fit(ctx, bottom, r * 1.4, { size: 20, min: 12, weight: 500, family: FONTS.mono });
  ctx.fillText(bottom, 0, r * 0.45);
  // cancellation waves to the left of the ring
  ctx.lineWidth = 4;
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath();
    for (let x = -r * 3.2; x <= -r - 8; x += 4) {
      const y = i * 26 + Math.sin(x / 18) * 7;
      if (x === -r * 3.2) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- the three cards ----------

function drawPostcard(ctx, w, h, p, o) {
  ctx.fillStyle = p.card;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, p.grain, 3000);

  // The photo, like a print, on the left half.
  photoOrScene(ctx, o.image, o.scene, 60, 60, 960, h - 120);

  // Divider, then the writing side.
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(1090, 110);
  ctx.lineTo(1090, h - 110);
  ctx.stroke();

  // Stamp (a small crop of the same photo) and the postmark over its corner.
  const stamp = perforated(210, 250, 9, 26, p.stamp);
  withShadow(ctx, () => ctx.drawImage(stamp, 1530, 70), { blur: 12, y: 4, color: 'rgba(0,0,0,0.22)' });
  photoOrScene(ctx, o.image, o.scene, 1550, 92, 170, 166);
  ctx.fillStyle = p.mark;
  ctx.font = `600 20px ${FONTS.mono}`;
  ctx.textAlign = 'center';
  ctx.fillText(String(o.year ?? ''), 1635, 296);
  postmark(ctx, 1405, 200, 92, p.mark, { top: 'MEMORY LANE', middle: o.shortDate || String(o.year ?? ''), bottom: o.place || '' });

  // Title and where/when.
  ctx.textAlign = 'left';
  ctx.fillStyle = p.ink;
  ctx.font = `500 74px ${FONTS.hand}`;
  const titleLines = wrap(ctx, o.title, 620).slice(0, 2);
  titleLines.forEach((line, i) => ctx.fillText(line, 1130, 430 + i * 82));
  const afterTitle = 430 + titleLines.length * 82;
  ctx.fillStyle = p.soft;
  fit(ctx, o.line, 620, { size: 26, min: 18, weight: 500, family: FONTS.mono });
  ctx.fillText(o.line, 1132, afterTitle - 22);

  // Ruled lines with the message in handwriting.
  const firstLine = afterTitle + 70;
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 2;
  for (let y = firstLine; y <= h - 230; y += 66) {
    ctx.beginPath();
    ctx.moveTo(1130, y);
    ctx.lineTo(1740, y);
    ctx.stroke();
  }
  ctx.fillStyle = p.accent;
  ctx.font = `500 42px ${FONTS.hand}`;
  wrap(ctx, o.message, 600)
    .slice(0, Math.floor((h - 230 - firstLine) / 66) + 1)
    .forEach((line, i) => ctx.fillText(line, 1136, firstLine - 14 + i * 66));

  // "To:" line.
  ctx.fillStyle = p.soft;
  ctx.font = `600 24px ${FONTS.mono}`;
  ctx.fillText(o.labels.to.toUpperCase(), 1130, h - 140);
  ctx.fillStyle = p.ink;
  ctx.font = `500 50px ${FONTS.hand}`;
  ctx.fillText(o.to || '', 1230, h - 138);
  ctx.strokeStyle = p.ink;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(1222, h - 120);
  ctx.lineTo(1740, h - 120);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = p.soft;
  ctx.font = `500 20px ${FONTS.mono}`;
  ctx.textAlign = 'right';
  ctx.fillText(`MEMORY LANE · ${o.labels.footer.toUpperCase()}`, 1740, h - 64);
}

function drawStamp(ctx, w, h, p, o) {
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, p.grain, 3500);

  const sw = 840;
  const sh = 1080;
  const sx = (w - sw) / 2;
  const sy = 170;
  const dark = p.style === 'darkroom';
  const stamp = perforated(sw, sh, 20, 52, p.stamp); // a shade lighter than the backdrop in the darkroom, so the perforations show
  const sctx = stamp.getContext('2d');
  sctx.globalCompositeOperation = 'source-atop'; // draw only on the stamp, never into the perforations
  const m = 64;
  photoOrScene(sctx, o.image, o.scene, m, m, sw - m * 2, sh - m * 2 - 230);
  // A thin frame inside, like an engraved border.
  sctx.strokeStyle = dark ? 'rgba(239,233,221,0.35)' : 'rgba(36,33,28,0.35)';
  sctx.lineWidth = 3;
  sctx.strokeRect(m - 18, m - 18, sw - (m - 18) * 2, sh - (m - 18) * 2);
  // Bottom band: big year, the title in handwriting, the place.
  sctx.fillStyle = p.mark;
  sctx.font = `700 132px ${FONTS.display}`;
  sctx.textAlign = 'left';
  sctx.fillText(String(o.year ?? ''), m, sh - m - 92);
  sctx.fillStyle = p.ink;
  fit(sctx, o.title, sw - m * 2 - 300, { size: 56, min: 30, family: FONTS.hand });
  sctx.textAlign = 'right';
  sctx.fillText(o.title, sw - m, sh - m - 140);
  sctx.fillStyle = p.soft;
  fit(sctx, o.place || '', sw - m * 2 - 300, { size: 24, min: 16, weight: 500, family: FONTS.mono });
  sctx.fillText((o.place || '').toUpperCase(), sw - m, sh - m - 96);
  sctx.textAlign = 'left';
  sctx.font = `600 24px ${FONTS.mono}`;
  sctx.fillText('MEMORY LANE', m, sh - m - 30);
  sctx.textAlign = 'right';
  sctx.fillText(o.labels.value.toUpperCase(), sw - m, sh - m - 30);

  ctx.save();
  ctx.translate(w / 2, sy + sh / 2);
  ctx.rotate(-0.025);
  withShadow(ctx, () => ctx.drawImage(stamp, -sw / 2, -sh / 2));
  ctx.restore();
  postmark(ctx, sx + sw - 70, sy + 120, 110, p.mark, { top: 'MEMORY LANE', middle: o.shortDate || String(o.year ?? ''), bottom: o.place || '' });
}

function drawPhotoCard(ctx, w, h, p, o) {
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, p.grain, 3500);

  if (p.style === 'darkroom') {
    // A frame of film: black strip, sprocket holes, edge printing.
    const fw = 980;
    const fh = 1240;
    const fx = (w - fw) / 2;
    const fy = 110;
    withShadow(ctx, () => {
      ctx.fillStyle = '#050505';
      ctx.fillRect(fx, fy, fw, fh);
    }, { color: 'rgba(0,0,0,0.6)' });
    ctx.fillStyle = p.bg;
    for (let x = fx + 30; x < fx + fw - 20; x += 64) {
      ctx.fillRect(x, fy + 22, 34, 46);
      ctx.fillRect(x, fy + fh - 68, 34, 46);
    }
    photoOrScene(ctx, o.image, o.scene, fx + 40, fy + 100, fw - 80, 820);
    ctx.fillStyle = '#d98b3a';
    ctx.font = `600 22px ${FONTS.mono}`;
    ctx.textAlign = 'left';
    ctx.fillText(`MEMORY LANE 400   ▸ ${o.frame}`, fx + 40, fy + 90);
    ctx.fillStyle = p.ink;
    fit(ctx, o.title, fw - 80, { size: 76, min: 40, weight: 700, family: FONTS.display });
    ctx.fillText(o.title, fx + 40, fy + 1020);
    ctx.fillStyle = p.mark;
    fit(ctx, o.line.toUpperCase(), fw - 80, { size: 26, min: 16, weight: 500, family: FONTS.mono });
    ctx.fillText(o.line.toUpperCase(), fx + 40, fy + 1070);
    return;
  }

  // A tilted instant photo with a strip of washi tape.
  const cw = 960;
  const ch = 1220;
  ctx.save();
  ctx.translate(w / 2, h / 2 - 10);
  ctx.rotate(-0.026);
  withShadow(ctx, () => {
    ctx.fillStyle = '#fffdf8';
    ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
  });
  photoOrScene(ctx, o.image, o.scene, -cw / 2 + 44, -ch / 2 + 44, cw - 88, cw - 88);
  ctx.fillStyle = p.ink;
  ctx.textAlign = 'left';
  fit(ctx, o.title, cw - 120, { size: 72, min: 40, family: FONTS.hand });
  ctx.fillText(o.title, -cw / 2 + 60, ch / 2 - 150);
  ctx.fillStyle = p.soft;
  fit(ctx, o.line, cw - 120, { size: 28, min: 18, weight: 500, family: FONTS.mono });
  ctx.fillText(o.line, -cw / 2 + 62, ch / 2 - 90);
  // tape
  ctx.rotate(0.06);
  ctx.fillStyle = 'rgba(244,214,120,0.78)';
  ctx.fillRect(-120, -ch / 2 - 34, 240, 70);
  ctx.restore();
}

/**
 * Draws a card onto `canvas`.
 * options: { kind, style, image, scene, title, line, place, year, shortDate, message, to, frame,
 *            labels: { to, footer, value } }
 */
export function renderCard(canvas, options) {
  const [w, h] = CARD_SIZES[options.kind] ?? CARD_SIZES.postcard;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const palette = { ...(PALETTES[options.style] ?? PALETTES.paper), style: options.style };
  ctx.textBaseline = 'alphabetic';
  if (options.kind === 'stamp') drawStamp(ctx, w, h, palette, options);
  else if (options.kind === 'photo') drawPhotoCard(ctx, w, h, palette, options);
  else drawPostcard(ctx, w, h, palette, options);
}

/** The finished card as a JPEG file (small enough for Zalo or Messenger, sharp enough to print). */
export function cardFile(canvas, name) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(new File([blob], name, { type: 'image/jpeg' })) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      0.92,
    );
  });
}
