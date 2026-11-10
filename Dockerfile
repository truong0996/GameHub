# Ảnh chạy hub trên Azure Container Apps (xem deploy/azure-setup.sh). Không có bước build: chỉ chép mã nguồn.
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
# Trên Azure, /app/data được gắn Azure Files (giữ tài khoản + lịch sử ván qua các lần deploy / scale về 0).
RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 3000
CMD ["node", "server.js"]
