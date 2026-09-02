#!/usr/bin/env bash
# Submits this module's v1.17.0 release to the Bitfocus Developer Portal
# (PUT /v1/modules/package), matching the shape Bitfocus's own
# bitfocus/companion-bundled-modules repo uses internally.
#
# Usage:
#   1. Generate an API key at https://developer.bitfocus.io -> Settings -> API Key
#   2. export BITFOCUS_API_KEY=bfd_xxxxxxxx
#   3. ./scripts/publish-to-bitfocus-portal.sh
#
# Your key is only ever read from the environment variable you set — this
# script never prints it or writes it to a file.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${BITFOCUS_API_KEY:?Set BITFOCUS_API_KEY first (export BITFOCUS_API_KEY=bfd_...)}"

VERSION="1.17.0"
TGZ="agentdeck-${VERSION}.tgz"
REPO="houtacheng/companion-module-agentdeck"

if [ ! -f "$TGZ" ]; then
  echo "Missing $TGZ in the project root — run 'npm run package' first." >&2
  exit 1
fi

PKG_SHA=$(shasum -a 256 "$TGZ" | awk '{print $1}')
GIT_TAG="v${VERSION}"
GIT_SHA=$(git rev-list -n 1 "$GIT_TAG")

PAYLOAD=$(jq -n \
  --arg moduleType "companion-connection" \
  --arg moduleName "agentdeck" \
  --arg logUrl "https://github.com/${REPO}/releases/tag/v${VERSION}" \
  --arg pkgDirUrl "https://github.com/${REPO}/releases/download/v${VERSION}" \
  --arg pkgName "$TGZ" \
  --arg pkgSha "$PKG_SHA" \
  --arg helpDirUrl "https://raw.githubusercontent.com/${REPO}/v${VERSION}/companion" \
  --arg gitTag "$GIT_TAG" \
  --arg gitSha "$GIT_SHA" \
  --arg manifestJson "$(cat companion/manifest.json)" \
  '{
    moduleType: $moduleType,
    moduleName: $moduleName,
    logUrl: $logUrl,
    pkgDirUrl: $pkgDirUrl,
    pkgName: $pkgName,
    pkgSha: $pkgSha,
    helpDirUrl: $helpDirUrl,
    gitTag: $gitTag,
    gitSha: $gitSha,
    manifestJson: $manifestJson
  }')

echo "Submitting:"
echo "$PAYLOAD" | jq .

curl -X PUT 'https://developer.bitfocus.io/api/v1/modules/package' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${BITFOCUS_API_KEY}" \
  -d "$PAYLOAD" \
  --fail-with-body \
  --show-error
