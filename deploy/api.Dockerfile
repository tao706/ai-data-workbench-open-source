FROM node:22-bookworm-slim AS build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build && npm prune --omit=dev
FROM node:22-bookworm-slim
WORKDIR /app/backend
ENV NODE_ENV=production HOST=0.0.0.0
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/node_modules ./node_modules
COPY backend/package.json ./
RUN mkdir -p /app/backend/data /app/backend/uploads /app/analysis-service/output && chown -R node:node /app
USER node
EXPOSE 3100
CMD ["node", "dist/server.js"]
