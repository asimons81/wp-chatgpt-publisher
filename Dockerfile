FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY apps/chatgpt-ui/package.json apps/chatgpt-ui/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/tool-schemas/package.json packages/tool-schemas/package.json
COPY packages/test-fixtures/package.json packages/test-fixtures/package.json
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/apps/mcp-server/dist ./apps/mcp-server/dist
COPY --from=build --chown=app:app /app/apps/mcp-server/package.json ./apps/mcp-server/package.json
COPY --from=build --chown=app:app /app/apps/chatgpt-ui/dist ./apps/chatgpt-ui/dist
COPY --from=build --chown=app:app /app/packages ./packages
USER app
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "apps/mcp-server/dist/index.js"]
