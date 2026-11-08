/**
 * Live updates with Server-Sent Events (SSE). Each signed-in browser tab keeps one long HTTP
 * response open (GET /api/events); whenever something happens that concerns that person — a new
 * note under a memory they can see, a memory just shared with them — the server writes one event
 * into it and the page updates at once.
 *
 * Each connection is bound to the session that opened it (the hash of that session's cookie).
 * Logging out, revoking sessions, changing the password or deleting the account closes those
 * responses, so a tab left open does not keep receiving private events.
 *
 * Why SSE and not WebSockets: this app only needs server → browser messages (the browser still
 * sends everything through the normal JSON API). SSE is plain HTTP — no extra library, the
 * browser's EventSource reconnects by itself, and it goes through proxies and our cookie login.
 *
 * Subscribers live in memory, in this one process. With several servers behind a load balancer,
 * publish through a shared channel instead (Redis pub/sub) — see docs/MO-RONG.md.
 */
export function createLive({ heartbeatMs = 25_000 } = {}) {
  const clients = new Map(); // userId → Set of { res, sessionId, heartbeat, closed }

  function forget(entry) {
    const tabs = clients.get(entry.userId);
    if (!tabs) return;
    tabs.delete(entry);
    if (!tabs.size) clients.delete(entry.userId);
  }

  function closeEntry(entry) {
    if (!entry || entry.closed) return;
    entry.closed = true;
    clearInterval(entry.heartbeat);
    forget(entry);
    const res = entry.res;
    if (res.writableEnded || res.destroyed) return;
    try {
      res.end();
    } catch {
      // The browser already hung up.
    }
  }

  function eachEntry() {
    const all = [];
    for (const tabs of clients.values()) all.push(...tabs);
    return all;
  }

  return {
    /** Keeps the response open as an event stream for this session of req.user. */
    connect(req, res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // nginx: do not hold events back in a buffer
      });
      res.write('retry: 5000\n\n'); // if the connection drops, the browser retries after 5 s
      const entry = {
        userId: req.user.id,
        sessionId: req.sessionId,
        res,
        closed: false,
        heartbeat: null,
      };
      // A comment line every 25 s keeps proxies from closing a quiet connection.
      entry.heartbeat = setInterval(() => {
        if (entry.closed) return;
        try {
          res.write(': ping\n\n');
        } catch {
          closeEntry(entry);
        }
      }, heartbeatMs);
      entry.heartbeat.unref();
      if (!clients.has(entry.userId)) clients.set(entry.userId, new Set());
      clients.get(entry.userId).add(entry);
      req.on('close', () => closeEntry(entry));
    },

    /** Closes the streams opened by this session (logout). Other devices stay connected. */
    closeSession(sessionId) {
      if (!sessionId) return;
      for (const entry of eachEntry()) {
        if (entry.sessionId === sessionId) closeEntry(entry);
      }
    },

    /** Closes every stream for this user (password change, logout everywhere, account deletion). */
    closeUser(userId) {
      for (const entry of eachEntry()) {
        if (entry.userId === userId) closeEntry(entry);
      }
    },

    /** Sends `event` ({ type, … }) to every open tab of these users. */
    publish(userIds, event) {
      const message = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
      for (const userId of new Set(userIds)) {
        for (const entry of clients.get(userId) ?? []) {
          if (entry.closed) continue;
          try {
            entry.res.write(message);
          } catch {
            closeEntry(entry);
          }
        }
      }
    },

    /** How many people are connected right now (for tests and monitoring). */
    connectedUsers: () => clients.size,
  };
}
