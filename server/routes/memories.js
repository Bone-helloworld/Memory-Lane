import { Router } from 'express';
import { HttpError, notFound } from '../lib/errors.js';
import { scrubMetadata } from '../lib/metadata.js';
import { idParam, parseIdList, validator } from '../lib/validate.js';
import { addDays, isValidDate, toISODate } from '../../shared/dates.js';
import { CARD_KINDS, CARD_STYLES, LIMITS } from '../../shared/limits.js';

const MB = 1024 * 1024;

export function memoryRoutes({ config, memories, artifacts, social, files, live }) {
  const router = Router();

  // One photo or video per request (plus a poster frame for videos), streamed to disk.
  const upload = files.uploader(Math.max(config.maxVideoMb, config.maxUploadMb) * MB);

  router.get('/', (req, res) => {
    res.json({
      memories: memories.list(req.user.id, {
        year: parseYearFilter(req.query.year),
        q: String(req.query.q ?? '').slice(0, LIMITS.searchQuery),
        personId: Number(req.query.person) || undefined,
      }),
    });
  });

  router.get('/years', (req, res) => {
    res.json({ years: memories.years(req.user.id) });
  });

  // Owner or someone it was shared with; everyone else gets 404.
  router.get('/:id', (req, res) => {
    const memory = memories.get(req.user.id, idParam(req.params.id));
    if (!memory) throw notFound();
    // Keepsake cards stay private: only the owner sees the ones made from this memory.
    if (memory.access === 'owner') memory.artifacts = artifacts.forMemory(req.user.id, memory.id);
    res.json({ memory });
  });

  router.post('/', (req, res) => {
    const data = readMemoryForm(req.body);
    const id = memories.create(req.user.id, { ...data, scene: 1 + Math.floor(Math.random() * 5) });
    res.status(201).json({ memory: memories.get(req.user.id, id) });
  });

  router.put('/:id', (req, res) => {
    const id = idParam(req.params.id);
    if (!memories.update(req.user.id, id, readMemoryForm(req.body))) throw notFound();
    res.json({ memory: memories.get(req.user.id, id) });
  });

  router.delete('/:id', (req, res) => {
    const names = memories.remove(req.user.id, idParam(req.params.id));
    if (!names) throw notFound();
    names.forEach((name) => files.remove(name));
    res.status(204).end();
  });

  // ---------- photos & videos ----------
  // POST /:id/files — multipart: file (photo or video), poster (optional preview image),
  // width, height, duration (optional, measured by the browser).

  const tooManyFiles = () => new HttpError(400, 'VALIDATION', { file: { code: 'TOO_MANY_FILES', max: LIMITS.maxFilesPerMemory } });
  const storageFull = () => new HttpError(400, 'VALIDATION', { file: { code: 'STORAGE_FULL', max: config.storageMb } });

  // Checked before a single byte is written to disk: someone else's memory, a full memory
  // or a full account is refused straight away instead of after a 100 MB upload.
  function beforeUpload(req, res, next) {
    const id = idParam(req.params.id);
    if (!memories.owns(req.user.id, id)) throw notFound();
    if (memories.fileCount(id) >= LIMITS.maxFilesPerMemory) throw tooManyFiles();
    const incoming = Number(req.get('content-length')) || 0;
    if (memories.storageUsed(req.user.id) + incoming > config.storageMb * MB) throw storageFull();
    next();
  }

  router.post('/:id/files', beforeUpload, upload, async (req, res) => {
    const main = req.files?.file?.[0];
    const poster = req.files?.poster?.[0];
    let adopted = [];
    try {
      const id = idParam(req.params.id);
      const v = validator(req.body);
      const type = main ? files.inspect(main.path) : null;
      if (!main) v.fail('file', 'REQUIRED');
      else if (!type) v.fail('file', 'FILE_TYPE');
      else if (type.kind === 'image' && main.size > config.maxUploadMb * MB) {
        v.fail('file', 'FILE_TOO_LARGE', { max: config.maxUploadMb });
      } else if (type.kind === 'video' && main.size > config.maxVideoMb * MB) {
        v.fail('file', 'FILE_TOO_LARGE', { max: config.maxVideoMb });
      }
      // The "poster" is a small preview image made by the browser: a still frame for a video,
      // a thumbnail for a photo. Grids show it instead of downloading the full file.
      const posterType = poster ? files.inspect(poster.path) : null;
      if (poster && (posterType?.kind !== 'image' || poster.size > 3 * MB)) v.fail('poster', 'FILE_TYPE');
      const width = v.int('width', { min: 1, max: 20000 });
      const height = v.int('height', { min: 1, max: 20000 });
      const duration = v.number('duration', { min: 0, max: LIMITS.videoMaxSeconds });
      v.check();
      if (memories.fileCount(id) >= LIMITS.maxFilesPerMemory) throw tooManyFiles();
      if (memories.storageUsed(req.user.id) + main.size > config.storageMb * MB) throw storageFull();

      // GPS position, camera serial number… removed before the file is kept (see lib/metadata.js).
      await scrubMetadata(main.path, type.ext);
      if (poster) await scrubMetadata(poster.path, posterType.ext);

      const name = files.adopt(main.path, type.ext);
      adopted.push(name);
      const posterName = poster ? files.adopt(poster.path, posterType.ext) : null;
      if (posterName) adopted.push(posterName);

      memories.addFile(req.user.id, id, {
        kind: type.kind,
        file: name,
        poster: posterName,
        width,
        height,
        duration: type.kind === 'video' ? duration : null,
        size: main.size,
      });
      adopted = [];
      res.status(201).json({ memory: memories.get(req.user.id, id) });
    } finally {
      // Whatever was not kept is removed: temp files of a refused upload, or files whose DB insert failed.
      files.discard(main?.path);
      files.discard(poster?.path);
      adopted.forEach((name) => files.remove(name));
    }
  });

  // ---------- keepsakes ("kỷ vật"): a card made from this memory, kept in the Artifacts tab ----------
  // POST /:id/artifacts — multipart: file (the card image drawn by the browser), poster (a small preview),
  // kind, style, title, line, message, recipient, width, height. Only from a memory you own: a card of a
  // memory shared with you can be downloaded or sent on, but a copy of someone else's photo is not kept
  // in your account.

  function beforeCard(req, res, next) {
    if (!memories.owns(req.user.id, idParam(req.params.id))) throw notFound();
    const incoming = Number(req.get('content-length')) || 0;
    if (memories.storageUsed(req.user.id) + incoming > config.storageMb * MB) throw storageFull();
    next();
  }

  router.post('/:id/artifacts', beforeCard, upload, async (req, res) => {
    const main = req.files?.file?.[0];
    const poster = req.files?.poster?.[0];
    let adopted = [];
    try {
      const memoryId = idParam(req.params.id);
      const v = validator(req.body);
      const kind = v.oneOf('kind', CARD_KINDS);
      const style = v.oneOf('style', CARD_STYLES, 'paper');
      const title = v.text('title', { required: true, max: LIMITS.cardTitle });
      const line = v.text('line', { max: LIMITS.cardLine });
      const message = v.text('message', { max: LIMITS.cardMessage });
      const recipient = v.text('recipient', { max: LIMITS.cardRecipient });
      const width = v.int('width', { min: 1, max: 20000 });
      const height = v.int('height', { min: 1, max: 20000 });
      const type = main ? files.inspect(main.path) : null;
      if (!main) v.fail('file', 'REQUIRED');
      else if (type?.kind !== 'image') v.fail('file', 'FILE_TYPE');
      else if (main.size > config.maxUploadMb * MB) v.fail('file', 'FILE_TOO_LARGE', { max: config.maxUploadMb });
      const posterType = poster ? files.inspect(poster.path) : null;
      if (poster && (posterType?.kind !== 'image' || poster.size > 3 * MB)) v.fail('poster', 'FILE_TYPE');
      v.check();
      const size = main.size + (poster?.size ?? 0);
      if (memories.storageUsed(req.user.id) + size > config.storageMb * MB) throw storageFull();

      await scrubMetadata(main.path, type.ext);
      if (poster) await scrubMetadata(poster.path, posterType.ext);
      const file = files.adopt(main.path, type.ext);
      adopted.push(file);
      const preview = poster ? files.adopt(poster.path, posterType.ext) : null;
      if (preview) adopted.push(preview);

      const id = artifacts.create(req.user.id, { memoryId, kind, style, title, line, message, recipient, file, preview, width, height, size });
      adopted = [];
      res.status(201).json({ artifact: artifacts.get(req.user.id, id) });
    } finally {
      // Whatever was not kept is removed: temp files of a refused upload, or files whose DB insert failed.
      files.discard(main?.path);
      files.discard(poster?.path);
      adopted.forEach((name) => files.remove(name));
    }
  });

  router.delete('/:id/files/:fileId', (req, res) => {
    const names = memories.removeFile(req.user.id, idParam(req.params.id), idParam(req.params.fileId));
    if (!names) throw notFound();
    names.forEach((name) => files.remove(name));
    res.json({ memory: memories.get(req.user.id, idParam(req.params.id)) });
  });

  // Body: { ids: [fileId, …] } in the new order — the first file becomes the cover.
  router.put('/:id/files/order', (req, res) => {
    const id = idParam(req.params.id);
    if (!memories.reorderFiles(req.user.id, id, parseIdList(req.body?.ids, LIMITS.maxFilesPerMemory))) throw notFound();
    res.json({ memory: memories.get(req.user.id, id) });
  });

  // ---------- sharing (owner only) ----------

  router.get('/:id/shares', (req, res) => {
    const id = idParam(req.params.id);
    const recipients = social.recipients(req.user.id, id);
    if (!recipients) throw notFound();
    res.json({ recipients, circle: social.connections(req.user.id) });
  });

  // Body: { userIds: [...] } — the complete list of people who may see this memory.
  router.put('/:id/shares', (req, res) => {
    const id = idParam(req.params.id);
    const before = social.recipients(req.user.id, id)?.map((person) => person.id) ?? [];
    const recipients = social.setRecipients(req.user.id, id, parseIdList(req.body?.userIds, 500));
    if (!recipients) throw notFound();
    // Tell the people who can now see it (their "Shared with you" updates at once).
    const added = recipients.map((person) => person.id).filter((userId) => !before.includes(userId));
    if (added.length) {
      const memory = memories.get(req.user.id, id);
      live.publish(added, { type: 'shared', memoryId: id, title: memory.title, by: { id: req.user.id, name: req.user.name } });
    }
    res.json({ recipients });
  });

  // ---------- comments ("lời nhắn"): owner and recipients ----------

  router.get('/:id/comments', (req, res) => {
    const id = idParam(req.params.id);
    if (!social.canView(req.user.id, id)) throw notFound();
    res.json({ comments: social.comments(id) });
  });

  router.post('/:id/comments', (req, res) => {
    const id = idParam(req.params.id);
    if (!social.canView(req.user.id, id)) throw notFound();
    const v = validator(req.body);
    const body = v.text('body', { required: true, max: LIMITS.comment });
    v.check();
    const comment = social.addComment(id, req.user.id, body);
    // Everyone else who can see this memory gets the note live.
    const others = social.audience(id).filter((userId) => userId !== req.user.id);
    live.publish(others, { type: 'comment', memoryId: id, title: memories.get(req.user.id, id).title, comment });
    res.status(201).json({ comment });
  });

  router.delete('/:id/comments/:commentId', (req, res) => {
    const id = idParam(req.params.id);
    const commentId = idParam(req.params.commentId);
    const audience = social.audience(id);
    if (!social.removeComment(id, commentId, req.user.id)) throw notFound();
    live.publish(audience.filter((userId) => userId !== req.user.id), { type: 'comment-removed', memoryId: id, commentId });
    res.status(204).end();
  });

  return router;
}

/** ?year=2019 → { exact: 2019 } · ?year=before-2009 → { before: 2009 } */
function parseYearFilter(value) {
  const text = String(value ?? '');
  if (/^\d{4}$/.test(text)) return { exact: Number(text) };
  const before = /^before-(\d{4})$/.exec(text);
  return before ? { before: Number(before[1]) } : undefined;
}

function readMemoryForm(body) {
  const v = validator(body);
  const data = {
    title: v.text('title', { required: true, max: LIMITS.memoryTitle }),
    place: v.text('place', { max: LIMITS.memoryPlace }),
    story: v.text('story', { max: LIMITS.memoryStory }),
    year: v.int('year', { required: true, min: LIMITS.yearMin, max: new Date().getFullYear() + 1 }),
    month: v.int('month', { min: 1, max: 12 }),
    day: v.int('day', { min: 1, max: 31 }),
    peopleIds: parseIdList(body?.peopleIds, LIMITS.maxTaggedPeople),
  };
  if (data.day && !data.month) v.fail('month', 'REQUIRED_FOR_DAY');
  if (data.year && data.month && data.day && !isValidDate(data.year, data.month, data.day)) v.fail('day', 'INVALID_DATE');
  if (!v.hasErrors() && isInFuture(data)) v.fail('year', 'FUTURE_DATE');
  v.check();
  return data;
}

/** Compares a partial date (year / year+month / full date) with tomorrow (time-zone slack). */
function isInFuture({ year, month, day }) {
  const [maxYear, maxMonth, maxDay] = addDays(toISODate(), 1).split('-').map(Number);
  if (year !== maxYear) return year > maxYear;
  if (!month || month !== maxMonth) return Boolean(month) && month > maxMonth;
  return (day ?? 1) > maxDay;
}
