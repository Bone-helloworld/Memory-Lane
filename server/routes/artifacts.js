import { Router } from 'express';
import { notFound } from '../lib/errors.js';
import { idParam } from '../lib/validate.js';
import { CARD_KINDS } from '../../shared/limits.js';

/**
 * "Kỷ vật" (Artifacts): the keepsake cards saved from your memories — the catalogue of the Artifacts tab.
 * A card is made in the card studio of a memory and saved with POST /api/memories/:id/artifacts
 * (see routes/memories.js); here you list, open and delete them. Private to their owner.
 */
export function artifactRoutes({ artifacts, files }) {
  const router = Router();

  router.get('/', (req, res) => {
    const kind = CARD_KINDS.includes(req.query.kind) ? req.query.kind : undefined;
    res.json({ artifacts: artifacts.list(req.user.id, { kind }) });
  });

  router.get('/:id', (req, res) => {
    const artifact = artifacts.get(req.user.id, idParam(req.params.id));
    if (!artifact) throw notFound();
    res.json({ artifact });
  });

  router.delete('/:id', (req, res) => {
    const names = artifacts.remove(req.user.id, idParam(req.params.id));
    if (!names) throw notFound();
    names.forEach((name) => files.remove(name));
    res.status(204).end();
  });

  return router;
}
