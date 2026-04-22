# Android Google Play Automation

This project supports automatic Android release generation and upload via Fastlane.

## Prerequisites

- `ANDROID_PACKAGE_NAME` (example: `com.tokentails.app`)
- Google Play service account key
  - `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64` (base64 encoded JSON), or
  - `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH` (path to JSON file)
- Ruby + Bundler installed in CI runner

## Release command

From repo root:

```bash
./scripts/android-play-release.sh
```

The script:

1. Validates required env vars
2. Resolves Google Play JSON key path
3. Runs `bundle install` in `android/`
4. Builds `app-release.aab`
5. Uploads to Google Play `internal` track

## CI example

```bash
export ANDROID_PACKAGE_NAME="com.tokentails.app"
export GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_B64="$PLAY_JSON_B64"
./scripts/android-play-release.sh
```
