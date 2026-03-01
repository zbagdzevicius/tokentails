#!/bin/zsh

 # fail if any command fails

 echo "🧩 Stage: Post-clone is activated .... "

 set -e
 # debug log
 set -x

# Install dependencies using Homebrew. This is MUST! Do not delete.
brew install node@20 yarn cocoapods fastlane
brew link --overwrite --force node@20 || true

 # Resolve deterministic paths for Xcode Cloud.
 SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
 IOS_APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
 REPO_ROOT="$(cd "$IOS_APP_DIR/../.." && pwd)"

 # Install iOS pods from ios/App and build web assets from repo root.
 echo "🎯 Stage: Install pods .... "
 cd "$IOS_APP_DIR"
 pod install

 echo "🎯 Stage: Install JS deps and sync app .... "
 cd "$REPO_ROOT"
 npm ci
 npm run app:ios:ci

 echo "🎯 Stage: Post-clone is done .... "

 exit 0
