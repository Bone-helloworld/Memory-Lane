import { Router } from 'express';
import { HttpError, notFound } from '../lib/errors.js';
import { rateLimit } from '../lib/rateLimit.js';
import { requireAuth } from '../lib/sessions.js';
import { idParam, validator } from '../lib/validate.js';
import { LIMITS } from '../../shared/limits.js';

const MAX_INVITES_PER_DAY = 30;

/**
 * Invite links — the only way into someone's circle. A link carries a random 192-bit token;
 * the database keeps only its SHA-256, so not even a stolen copy of the database can be used
 * to accept one. A link works once, expires after INVITE_DAYS, and can be withdrawn while unused.
 */
export function inviteRoutes({ config, social, live }) {
  const router = Router();
  // Guessing a token is hopeless anyway, but nobody gets to try quickly.
  const limiter = rateLimit({ windowMs: 15 * 60_000, max: 60 });

  // Public: the invite page shows who invited you before you sign in or create an account.
  // The inviter's private label and the "Old friends" entry it was sent to are never shown.
  router.get('/preview/:token', limiter, (req, res) => {
    const invite = social.findInvite(req.params.token);
    if (!invite) throw new HttpError(404, 'INVITE_INVALID');
    res.json({
      invite: {
        inviter: { name: invite.inviter_name },
        memory: invite.memory_id ? { title: invite.memory_title } : null,
        expiresAt: invite.expires_at,
        own: req.user?.id === invite.inviter_id,
      },
    });
  });

  // Accepting: you and the inviter join each other's circle (and see the attached memory, if any).
  router.post('/accept/:token', requireAuth, limiter, (req, res) => {
    const result = social.acceptInvite(req.params.token, req.user.id);
    if (result.error) throw new HttpError(result.error === 'INVITE_OWN' ? 400 : 404, result.error);
    // The inviter sees the new person in their circle at once.
    live.publish([result.inviter.id], { type: 'circle', by: { id: req.user.id, name: req.user.name } });
    res.json(result);
  });

  router.get('/', requireAuth, (req, res) => {
    res.json({ invites: social.invites(req.user.id) });
  });

  // Body: { label?, personId?, memoryId? } → the invite plus its token. The token is in this
  // response only — afterwards the server could not show it again even if it wanted to.
  router.post('/', requireAuth, (req, res) => {
    const v = validator(req.body);
    const label = v.text('label', { max: LIMITS.inviteLabel });
    const personId = v.int('personId', { min: 1 });
    const memoryId = v.int('memoryId', { min: 1 });
    v.check();
    if (social.invitesCreatedSince(req.user.id, new Date(Date.now() - 86_400_000)) >= MAX_INVITES_PER_DAY) {
      throw new HttpError(429, 'RATE_LIMITED');
    }
    const { id, token } = social.createInvite(req.user.id, { label, personId, memoryId, days: config.inviteDays });
    res.status(201).json({ invite: social.invite(req.user.id, id), token });
  });

  // Body: { memoryId } — used by the memory form, which creates the link before the memory is saved.
  router.put('/:id/memory', requireAuth, (req, res) => {
    const id = idParam(req.params.id);
    const v = validator(req.body);
    const memoryId = v.int('memoryId', { required: true, min: 1 });
    v.check();
    if (!social.attachMemory(req.user.id, id, memoryId)) throw notFound();
    res.json({ invite: social.invite(req.user.id, id) });
  });

  router.delete('/:id', requireAuth, (req, res) => {
    if (!social.revokeInvite(req.user.id, idParam(req.params.id))) throw notFound();
    res.status(204).end();
  });

  return router;
}
