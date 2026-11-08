import { Router } from 'express';
import { notFound } from '../lib/errors.js';

/**
 * Photos and videos are private: they are never served as public static files. Every request
 * is checked — signed in, a well-formed file name, and the file belongs to a memory you own
 * or one that was shared with you — before a byte is sent. Anyone else gets the same 404 as
 * for a file that does not exist, so file names cannot even be confirmed.
 *
 * res.sendFile answers HTTP Range requests, so a video starts playing (and can be seeked)
 * after the first few hundred kilobytes instead of after the whole 100 MB.
 */
export function fileRoutes({ memories, artifacts, files }) {
  const router = Router();

  router.get('/:name', (req, res) => {
    const { name } = req.params;
    const allowed = memories.canViewFile(req.user.id, name) || artifacts.canViewFile(req.user.id, name);
    if (!files.isValidName(name) || !allowed) throw notFound();
    res.sendFile(name, {
      root: files.dir,
      // private: no shared proxy may keep a copy. no-cache: the browser must ask again each
      // time (a cheap 304 thanks to the ETag), so once a share is withdrawn — or after logging
      // out on a shared computer — the file cannot be reopened from the cache.
      cacheControl: false,
      headers: { 'Cache-Control': 'private, no-cache' },
    });
  });

  return router;
}
