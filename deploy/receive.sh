#!/usr/bin/env bash
# Installed at /usr/local/bin/gamehub-deploy and invoked by the CI SSH key.
set -euo pipefail
umask 077

cd /opt/gamehub
exec 9>.deploy.lock
flock --wait 600 9

staging=$(mktemp -d /opt/gamehub/.incoming.XXXXXX)
trap 'rm -rf -- "$staging"' EXIT

# The workflow streams only application sources, never production data or secrets.
tar -xzf - -C "$staging" --no-same-owner --no-same-permissions
files=(Dockerfile compose.yaml .dockerignore package.json server.js hub public games tools deploy README.md)
for file in "${files[@]}"; do
  test -e "$staging/$file"
done

# Build before replacing the running container so build errors leave it running.
cd "$staging"
docker compose config --quiet
docker compose build --pull

# Sync only managed paths; preserve data, backups, and other server-local files.
for file in "${files[@]}"; do
  if [[ -d "$file" ]]; then
    mkdir -p "/opt/gamehub/$file"
    rsync -r --perms --delete --chmod=D755,F644 "$file/" "/opt/gamehub/$file/"
  else
    install -m 644 "$file" "/opt/gamehub/$file"
  fi
done

cd /opt/gamehub
if ! docker compose up -d --no-build --wait --wait-timeout 120; then
  docker compose logs --tail=100
  exit 1
fi
docker compose ps
