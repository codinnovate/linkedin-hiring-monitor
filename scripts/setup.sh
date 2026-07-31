#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Installing dependencies"
pnpm install

echo "==> Generating Prisma client"
pnpm db:generate

echo "==> Building shared workspace packages"
pnpm --filter @lhm/shared build
pnpm --filter @lhm/database build

echo "==> Installing Playwright Chromium (worker)"
pnpm playwright:install || echo "  (skip: no browser download available in this environment)"

echo ""
echo "==> Setup complete."
echo "  Next steps:"
echo "    1. pnpm docker:up            # start Postgres + Redis"
echo "    2. pnpm db:migrate           # create database schema"
echo "    3. pnpm dev                  # start backend, worker, frontend"
