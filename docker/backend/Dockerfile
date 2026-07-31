# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @lhm/database generate
RUN pnpm --filter @lhm/shared build && pnpm --filter @lhm/database build
RUN pnpm --filter @lhm/backend build

FROM node:22-alpine AS runtime
RUN corepack enable && apk add --no-cache openssl tini
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/.npmrc ./
RUN pnpm --filter @lhm/backend deploy --prod /out
COPY --from=build /app/apps/backend/dist /out/apps/backend/dist
COPY --from=build /app/packages/database/prisma /out/packages/database/prisma

WORKDIR /out
EXPOSE 3001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/backend/dist/server.js"]
