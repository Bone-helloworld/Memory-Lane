/**
 * Live updates with Server-Sent Events (SSE). Each signed-in browser tab keeps one long HTTP
 * response open (GET /api/events); whenever something happens that concerns that person — a new
 * note under a memory they can see, a memory just shared with them — the server writes one event
 * into it and the page updates at once.
 *
 * Why SSE and not WebSockets: this app only needs server → browser messages (the browser still
 * sends everything through the normal JSON API). SSE is plain HTTP — no extra library, the
 * browser's EventSource reconnects by itself, and it goes through proxies and our cookie login.
 *
 * Subscribers live in memory, in this one process. With several servers behind a load balancer,
 * publish through a shared channel instead (Redis pub/sub).
 */
export function createLive({ heartbeatMs = 25_000 } = {}) {
  const clients = new Map(); // userId → Set of open responses (one per tab)

  return {
    /** Keeps the response open as an event stream for req.user. */
    connect(req, res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // nginx: do not hold events back in a buffer
      });
      res.write('retry: 5000\n\n'); // if the connection drops, the browser retries after 5 s
      const userId = req.user.id;
      if (!clients.has(userId)) clients.set(userId, new Set());
      clients.get(userId).add(res);
      // A comment line every 25 s keeps proxies from closing a quiet connection.
      const heartbeat = setInterval(() => res.write(': ping\n\n'), heartbeatMs);
      req.on('close', () => {
        clearInterval(heartbeat);
        const tabs = clients.get(userId);
        tabs?.delete(res);
        if (!tabs?.size) clients.delete(userId);
      });
    },

    /** Sends `event` ({ type, … }) to every open tab of these users. */
    publish(userIds, event) {
      const message = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
      for (const userId of new Set(userIds)) {
        for (const res of clients.get(userId) ?? []) res.write(message);
      }
    },

    /** How many people are connected right now (for tests and monitoring). */
    connectedUsers: () => clients.size,
  };
}
