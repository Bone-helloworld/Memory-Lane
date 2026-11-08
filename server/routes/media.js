import { Router } from 'express';
import { notFound } from '../lib/errors.js';
import { idParam, validator } from '../lib/validate.js';
import { LIMITS, MEDIA_KINDS } from '../../shared/limits.js';

/** "Kho phim & nhạc" — films and songs the family loved. */
export function mediaRoutes({ media }) {
  const router = Router();

  router.get('/', (req, res) => {
    const kind = MEDIA_KINDS.includes(req.query.kind) ? req.query.kind : undefined;
    res.json({ media: media.list(req.user.id, { kind }) });
  });

  router.post('/', (req, res) => {
    const id = media.create(req.user.id, readMediaForm(req.body));
    res.status(201).json({ item: media.get(req.user.id, id) });
  });

  router.put('/:id', (req, res) => {
    const id = idParam(req.params.id);
    if (!media.update(req.user.id, id, readMediaForm(req.body))) throw notFound();
    res.json({ item: media.get(req.user.id, id) });
  });

  router.delete('/:id', (req, res) => {
    if (!media.remove(req.user.id, idParam(req.params.id))) throw notFound();
    res.status(204).end();
  });

  return router;
}

function readMediaForm(body) {
  const v = validator(body);
  const data = {
    kind: v.oneOf('kind', MEDIA_KINDS),
    title: v.text('title', { required: true, max: LIMITS.mediaTitle }),
    owner: v.text('owner', { max: LIMITS.mediaOwner }),
    era: v.text('era', { max: LIMITS.mediaEra }),
    url: v.url('url', { max: LIMITS.mediaUrl }),
    story: v.text('story', { max: LIMITS.mediaStory }),
  };
  v.check();
  return data;
}
