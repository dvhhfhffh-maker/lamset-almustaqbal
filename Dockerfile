FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY . .
RUN mkdir -p /app/data /app/uploads && chown -R node:node /app/data /app/uploads
USER node
EXPOSE 3000
CMD ["node", "src/server.mjs"]
