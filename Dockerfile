FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DB_PATH=/app/data/calculator.sqlite
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "src/server.js"]
