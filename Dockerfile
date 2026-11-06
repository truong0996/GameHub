FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    HUB_DATA=/app/data

WORKDIR /app
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node hub ./hub
COPY --chown=node:node public ./public
COPY --chown=node:node games ./games
COPY --chown=node:node tools ./tools
RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
