# Memory Lane — production image (works on Fly.io, Railway, Render, any VPS).
# Mount a persistent volume at /data: it holds the SQLite database, photos and videos.

# ---- 1. Build the React app ----
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- 2. Run the API + serve the built app ----
FROM node:24-slim
ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY shared ./shared
COPY --from=build /app/client/dist ./client/dist
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 3001
# "Is it healthy?" — the server answers {"ok":true} when it can read its database. No curl in the image: Node asks.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# Re-seeds only the two demo accounts (real accounts are never touched), then starts the server.
CMD ["sh", "-c", "if [ \"$ALLOW_DEMO\" != \"false\" ]; then node server/seed.js; fi && node server/index.js"]
