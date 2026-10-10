FROM node:22-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production DB_FILE=/data/query.db UPLOAD_DIR=/data/uploads
RUN mkdir -p /data/uploads
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
