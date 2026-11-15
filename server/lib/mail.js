import nodemailer from 'nodemailer';

/**
 * Sends a contact-form message over SMTP.
 * Returns null when SMTP_HOST is not set — the form still stores the message.
 *
 * `transport` is for tests: pass `{ sendMail }` and nodemailer is not called.
 */
export function createMailer(config, transport) {
  if (!config.smtp?.host) return null;
  const tx =
    transport ??
    nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });

  return {
    async send({ kind, name, email, message }) {
      await tx.sendMail({
        from: config.smtp.user || config.feedbackTo,
        to: config.feedbackTo,
        replyTo: email,
        subject: `Memory Lane contact: ${kind} — ${name}`,
        text: `Type: ${kind}\nName: ${name}\nEmail: ${email}\n\n${message}`,
      });
    },
  };
}
