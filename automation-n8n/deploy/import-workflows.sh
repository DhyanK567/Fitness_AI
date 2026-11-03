#!/usr/bin/env bash
# Import all workflow JSON files from the repo into n8n.
set -euo pipefail
cd "$(dirname "$0")/../.."
docker compose exec -T n8n sh -c "rm -rf /tmp/wf && mkdir -p /tmp/wf"
docker cp automation-n8n/workflows/. "$(docker compose ps -q n8n):/tmp/wf/"
docker compose exec -T n8n n8n import:workflow --separate --input=/tmp/wf/
echo "Imported."