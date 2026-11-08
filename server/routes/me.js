import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { validator } from '../lib/validate.js';
import { toUser } from '../models/users.js';
import { LIMITS, LOCALES } from '../../shared/limits.js';
import { toISODate } from '../../shared/dates.js';

/** The logged-in user's own account: profile, language, password, export, deletion. */
export function meRoutes({ config, users, memories, people, media, artifacts, social, files, sessions }) {
  const router = Router();

  // Settings → storage: how much of the account's space photos and videos use.
  router.get('/storage', (req, res) => {
    res.json({ used: memories.storageUsed(req.user.id), quota: config.storageMb * 1024 * 1024 });
  });

  router.patch('/', (req, res) => {
    const body = req.body ?? {};
    const v = validator(body);
    const name = 'name' in body ? v.text('name', { required: true, max: LIMITS.userName }) : req.user.name;
    const locale = 'locale' in body ? v.oneOf('locale', LOCALES) : req.user.locale;
    v.check();
    users.update(req.user.id, { name, locale });
    res.json({ user: toUser(users.byId(req.user.id)) });
  });

  // Change the password — or set a first one, for an account created with Google.
  router.post('/password', async (req, res) => {
    const v = validator(req.body);
    const newPassword = v.password('newPassword');
    const current = users.byId(req.user.id);
    if (current.password_hash && !(await verifyPassword(String(req.body?.currentPassword ?? ''), current.password_hash))) {
      v.fail('currentPassword', 'WRONG_PASSWORD');
    }
    v.check();
    users.setPassword(req.user.id, await hashPassword(newPassword));
    // Sign out every device (their sessions and their live streams), then keep this one signed in.
    sessions.revokeAll(req.user.id);
    sessions.start(res, req.user.id);
    res.status(204).end();
  });

  // Stop signing in with Google. Only allowed with a password, or the account could not be opened again.
  router.delete('/google', (req, res) => {
    const current = users.byId(req.user.id);
    if (!current.password_hash) throw new HttpError(400, 'NEEDS_PASSWORD');
    users.unlinkGoogle(req.user.id);
    res.json({ user: toUser(users.byId(req.user.id)) });
  });

  // Lost a phone, used a shared computer? Revoke every session, including this one.
  router.post('/logout-all', (req, res) => {
    sessions.revokeAll(req.user.id);
    sessions.end(req, res);
    res.status(204).end();
  });

  // "Xuất dữ liệu" — everything the user owns, as one JSON file. Other people's memories are
  // not theirs to export: only the comments the user wrote under them are included.
  router.get('/export', (req, res) => {
    const userId = req.user.id;
    const fileName = (url) => (url ? url.split('/').pop() : null);
    const payload = {
      app: 'memory-lane',
      format: 4,
      exportedAt: new Date().toISOString(),
      user: toUser(req.user),
      memories: memories.list(userId).map(({ files: list, cover, owner, access, ...memory }) => ({
        ...memory,
        files: list.map(({ url, posterUrl, ...file }) => ({ ...file, file: fileName(url), poster: fileName(posterUrl) })),
        sharedWith: social.recipients(userId, memory.id),
        comments: social.comments(memory.id),
      })),
      people: people.list(userId).map((person) => ({ ...person, notes: people.notes(person.id) })),
      media: media.list(userId),
      artifacts: artifacts.list(userId).map(({ imageUrl, previewUrl, memory, ...artifact }) => ({
        ...artifact,
        memoryId: memory.id,
        file: fileName(imageUrl),
        preview: fileName(previewUrl),
      })),
      circle: social.connections(userId),
      invites: social.invites(userId),
      commentsOnSharedMemories: social.commentsBy(userId),
    };
    res.attachment(`memory-lane-${toISODate()}.json`);
    res.send(JSON.stringify(payload, null, 2));
  });

  // Deleting an account is permanent; the user must type their email to confirm.
  router.delete('/', (req, res) => {
    const confirmation = String(req.body?.email ?? '').trim().toLowerCase();
    if (confirmation !== req.user.email.toLowerCase()) {
      throw new HttpError(400, 'VALIDATION', { email: { code: 'CONFIRM_MISMATCH' } });
    }
    const names = [...memories.allFileNames(req.user.id), ...artifacts.allFileNames(req.user.id)];
    // Close every live stream and drop every session before the rows disappear with the account.
    sessions.revokeAll(req.user.id);
    users.remove(req.user.id); // ON DELETE CASCADE: memories, shares, comments, circle, invites…
    names.forEach((name) => files.remove(name));
    sessions.end(req, res);
    res.status(204).end();
  });

  return router;
}
