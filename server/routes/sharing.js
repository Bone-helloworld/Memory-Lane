import { Router } from 'express';
import { notFound } from '../lib/errors.js';
import { idParam } from '../lib/validate.js';

/** The "Sharing" page in one request: your circle, your invite links, and memories shared both ways. */
export function sharingRoutes({ social, memories }) {
  const router = Router();

  router.get('/', (req, res) => {
    const userId = req.user.id;
    res.json({
      circle: social.connections(userId),
      invites: social.invites(userId),
      sharedWithMe: memories.sharedWith(userId),
      sharedByMe: memories.list(userId, { sharedOnly: true }),
    });
  });

  // Just the circle — for the "share with" checkboxes of the memory form.
  router.get('/circle', (req, res) => {
    res.json({ circle: social.connections(req.user.id) });
  });

  // Remove someone from your circle (works both ways): every share between you is withdrawn at once.
  router.delete('/circle/:userId', (req, res) => {
    if (!social.disconnect(req.user.id, idParam(req.params.userId))) throw notFound();
    res.status(204).end();
  });

  return router;
}
