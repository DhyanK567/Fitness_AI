#!/usr/bin/env bash
# Export all n8n workflows into automation-n8n/workflows/ (one JSON per workflow).
set -euo pipefail
cd "$(dirname "$0")/../.."
docker compose exec -T n8n sh -c "rm -rf /tmp/wf && mkdir -p /tmp/wf && n8n export:workflow --backup --output=/tmp/wf/"
docker cp "$(docker compose ps -q n8n):/tmp/wf/." automation-n8n/workflows/
echo "Exported. Rename files to match workflow names before committing."