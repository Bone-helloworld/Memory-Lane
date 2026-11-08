import { Router } from 'express';
import { notFound } from '../lib/errors.js';
import { clientToday } from '../lib/today.js';
import { idParam, validator } from '../lib/validate.js';
import { LIMITS, PERSON_COLORS } from '../../shared/limits.js';

export function peopleRoutes({ people, memories, social }) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({ people: people.list(req.user.id) });
  });

  // Person page: profile + notes + every memory they appear in + invites sent to them.
  router.get('/:id', (req, res) => {
    const id = idParam(req.params.id);
    const person = people.get(req.user.id, id);
    if (!person) throw notFound();
    res.json({
      person,
      notes: people.notes(id),
      memories: memories.list(req.user.id, { personId: id }),
      invites: social.invites(req.user.id).filter((invite) => invite.person?.id === id),
    });
  });

  router.post('/', (req, res) => {
    const id = people.create(req.user.id, readPersonForm(req.body));
    res.status(201).json({ person: people.get(req.user.id, id) });
  });

  router.put('/:id', (req, res) => {
    const id = idParam(req.params.id);
    if (!people.update(req.user.id, id, readPersonForm(req.body))) throw notFound();
    res.json({ person: people.get(req.user.id, id) });
  });

  router.delete('/:id', (req, res) => {
    if (!people.remove(req.user.id, idParam(req.params.id))) throw notFound();
    res.status(204).end();
  });

  // "I reached out today" — body.date is the browser's local date.
  router.post('/:id/contacted', (req, res) => {
    const id = idParam(req.params.id);
    if (!people.setLastContact(req.user.id, id, clientToday(req.body?.date))) throw notFound();
    res.json({ person: people.get(req.user.id, id) });
  });

  router.post('/:id/notes', (req, res) => {
    const id = idParam(req.params.id);
    const v = validator(req.body);
    const body = v.text('body', { required: true, max: LIMITS.note });
    v.check();
    const note = people.addNote(req.user.id, id, body);
    if (!note) throw notFound();
    res.status(201).json({ note });
  });

  router.delete('/:id/notes/:noteId', (req, res) => {
    if (!people.removeNote(req.user.id, idParam(req.params.id), idParam(req.params.noteId))) throw notFound();
    res.status(204).end();
  });

  return router;
}

function readPersonForm(body) {
  const v = validator(body);
  const data = {
    name: v.text('name', { required: true, max: LIMITS.personName }),
    relation: v.text('relation', { max: LIMITS.personRelation }),
    lastContact: v.pastDate('lastContact'),
    closeness: v.int('closeness', { min: 1, max: 5 }) ?? 3,
    color: v.oneOf('color', PERSON_COLORS, 'teal'),
  };
  v.check();
  return data;
}
