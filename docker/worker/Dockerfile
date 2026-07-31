# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/playwright:v1.53.0-noble AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @lhm/database generate
RUN pnpm --filter @lhm/shared build && pnpm --filter @lhm/database build
RUN pnpm --filter @lhm/worker build

FROM mcr.microsoft.com/playwright:v1.53.0-noble AS runtime
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/.npmrc ./
RUN pnpm --filter @lhm/worker deploy --prod /out
COPY --from=build /app/apps/worker/dist /out/apps/worker/dist
COPY --from=build /app/packages/database/prisma /out/packages/database/prisma

WORKDIR /out
CMD ["node", "apps/worker/dist/index.js"]
