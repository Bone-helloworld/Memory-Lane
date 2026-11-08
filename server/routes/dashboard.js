import { Router } from 'express';
import { clientToday } from '../lib/today.js';

export function dashboardRoutes({ memories, people, media, social }) {
  const router = Router();

  // Small payload for the navigation: counters + the "you haven't written about X" nudge.
  router.get('/summary', (req, res) => {
    const userId = req.user.id;
    const today = clientToday(req.query.today);
    res.json({
      counts: {
        onThisDay: memories.onThisDay(userId, today).length,
        memories: memories.count(userId),
        people: people.count(userId),
        media: media.count(userId),
        sharedWithMe: memories.countSharedWith(userId),
        circle: social.connections(userId).length,
      },
      latestSharedAt: memories.latestSharedAt(userId),
      suggestion: people.suggestion(userId, today),
    });
  });

  // Everything the "Today" page needs, in one request.
  router.get('/today', (req, res) => {
    const userId = req.user.id;
    const today = clientToday(req.query.today);
    res.json({
      today,
      stats: { memories: memories.count(userId), people: people.count(userId), media: media.count(userId) },
      featured: memories.featured(userId),
      filmstrip: filmstrip(memories, userId, today),
      people: people.list(userId, { limit: 3 }),
      media: media.list(userId, { limit: 3 }),
      sharedWithMe: memories.sharedWith(userId, { limit: 4 }),
      suggestion: people.suggestion(userId, today),
      years: memories.years(userId),
    });
  });

  return router;
}

/**
 * "Hôm nay, nhiều năm trước": memories within ±3 days of today in earlier years.
 * If there are none, fall back to the same month, then to a random handful,
 * so the film strip is never empty while the album has photos.
 */
function filmstrip(memories, userId, today, size = 5) {
  const day = memories.onThisDay(userId, today);
  if (day.length) return { mode: 'day', items: day.slice(0, size) };
  const month = memories.sameMonth(userId, today, size);
  if (month.length) return { mode: 'month', items: month };
  const random = memories.random(userId, size);
  return { mode: random.length ? 'random' : 'empty', items: random };
}
