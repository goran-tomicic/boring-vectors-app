#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

MODE="draft"
if [[ "${1:-}" == "--prod" ]]; then
  MODE="prod"
fi

npm run build

if [[ "$MODE" == "prod" ]]; then
  echo "Deploying to production..."
  npx netlify-cli deploy --dir=dist --prod
else
  echo "Deploying a draft preview (pass --prod to publish live)..."
  npx netlify-cli deploy --dir=dist
fi
