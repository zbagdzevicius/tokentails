#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"

if [[ -z "${ANDROID_PACKAGE_NAME:-}" ]]; then
  echo "ERROR: ANDROID_PACKAGE_NAME is required (example: com.tokentails.app)"
  exit 1
fi

if [[ -n "${GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64:-}" ]]; then
  KEY_PATH="$(mktemp -t google-play-key.XXXXXX.json)"
  echo "$GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64" | base64 --decode > "$KEY_PATH"
  export GOOGLE_PLAY_JSON_KEY_PATH="$KEY_PATH"
elif [[ -n "${GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH:-}" ]]; then
  export GOOGLE_PLAY_JSON_KEY_PATH="$GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH"
fi

if [[ -z "${GOOGLE_PLAY_JSON_KEY_PATH:-}" ]]; then
  echo "ERROR: Provide GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64 or GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH"
  exit 1
fi

if [[ ! -f "${GOOGLE_PLAY_JSON_KEY_PATH}" ]]; then
  echo "ERROR: GOOGLE_PLAY_JSON_KEY_PATH does not exist: ${GOOGLE_PLAY_JSON_KEY_PATH}"
  exit 1
fi

cd "$ANDROID_DIR"
bundle install
bundle exec fastlane android internal
