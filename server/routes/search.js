import { Router } from 'express';
import { LIMITS } from '../../shared/limits.js';

/** One search box across memories, people (incl. their notes), the film & music archive and artifacts. */
export function searchRoutes({ memories, people, media, artifacts }) {
  const router = Router();

  router.get('/', (req, res) => {
    const q = String(req.query.q ?? '').trim().slice(0, LIMITS.searchQuery);
    if (!q) return res.json({ q, memories: [], people: [], media: [], artifacts: [] });
    const userId = req.user.id;
    res.json({
      q,
      memories: memories.list(userId, { q, limit: 30 }),
      people: people.list(userId, { q, limit: 30 }),
      media: media.list(userId, { q, limit: 30 }),
      artifacts: artifacts.list(userId, { q, limit: 30 }),
    });
  });

  return router;
}
