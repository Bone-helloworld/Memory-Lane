import { Router } from 'express';
import { rateLimit, clientAddress } from '../lib/rateLimit.js';
import { validator } from '../lib/validate.js';
import { CONTACT_KINDS, LIMITS } from '../../shared/limits.js';

const oneLine = (value) => String(value).replace(/[\r\n]+/g, ' ');

/** A bot that fills the hidden field gets the same success response and nothing is stored. */
function honeypotFilled(body) {
  const value = body?.website;
  const text = Array.isArray(value) ? value.join('') : value == null ? '' : String(value);
  return text.trim() !== '';
}

export function contactRoutes({ config, contact }) {
  const router = Router();
  const limiter = rateLimit({ windowMs: 15 * 60_000, max: config.contactRateLimit });

  router.post('/', limiter, (req, res) => {
    if (honeypotFilled(req.body)) {
      console.log(`[${new Date().toISOString()}] CONTACT discarded honeypot from ${clientAddress(req)}`);
      return res.status(201).json({ ok: true });
    }

    const v = validator(req.body);
    const kind = v.oneOf('kind', CONTACT_KINDS);
    const name = v.text('name', { required: true, max: LIMITS.contactName });
    const email = v.email('email');
    const message = v.text('message', { required: true, max: LIMITS.contactMessage });
    v.check();

    const id = contact.create({ kind, name, email, message });
    console.log(
      `[${new Date().toISOString()}] CONTACT stored #${id} kind=${kind} name=${oneLine(name)} email=${email}\n${message}`,
    );
    res.status(201).json({ ok: true });
  });

  return router;
}
