# PriceWise ישראל — one container: the web app + price API + AI recognition.
# Must run on a host in Israel (some chains' price portals block foreign IPs).
FROM node:24-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Client build talks to its own server under /pw-api (see .env.production).
RUN npm run build

ENV NODE_ENV=production \
    PORT=8787 \
    PRICEWISE_DB=/data/pricewise.db \
    PRICEWISE_CACHE=/data/cache/
VOLUME ["/data"]
EXPOSE 8787

# Serve immediately; ingest in the background now and every 6 hours after.
# (The very first full ingest takes ~1.5 h; until then prices fill in chain by chain.)
CMD ["node", "server/src/cli.ts", "serve", "--refresh-hours", "6", "--stores", "all", "--ingest-on-start"]
