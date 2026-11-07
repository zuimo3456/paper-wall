FROM node:24-bookworm-slim
WORKDIR /app
COPY server.mjs ./server.mjs
COPY public ./public
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV PORT=8080 DATA_DIR=/app/data
VOLUME ["/app/data"]
EXPOSE 8080
CMD ["node","server.mjs"]
