# publicomtools-snap: headless Chromium som renderar skyltsidor till bilder åt publicomtools
# ("Sida som bild"). En egen avbild så att publicomtools förblir liten och webbläsaren isolerad.
# Node-versionen som i ../Dockerfile, från vår kopia på ghcr.io (se ../Dockerfile).
FROM ghcr.io/kth-biblioteket/node:22.23.2-alpine
# Chromium och typsnitt (Noto täcker svenska tecken och emoji på sidorna)
RUN apk add --no-cache chromium font-noto font-noto-emoji ttf-freefont \
    && addgroup -S snap && adduser -S -G snap snap
ENV NODE_ENV=production PUPPETEER_SKIP_DOWNLOAD=1 CHROMIUM_PATH=/usr/bin/chromium-browser
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
USER snap
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "server.js"]
