#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "📦 Preparing Standalone BEATDROP Android TV APK build (clean — no pre-bundled database)..."

# Check for Android SDK
if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
  if [ -d "$HOME/Library/Android/sdk" ]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  elif [ -d "/opt/homebrew/share/android-commandlinetools" ]; then
    export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
  else
    echo ""
    echo "ℹ️  Android SDK not detected yet. Installing Android Command Line Tools via Homebrew..."
    echo "   Run: brew install --cask android-commandlinetools"
    echo "   Then: sdkmanager 'platforms;android-34' 'build-tools;34.0.0'"
    exit 1
  fi
fi

echo "🔨 Building APK with Gradle..."
cd android-tv
gradle assembleRelease

APK_SRC="app/build/outputs/apk/release/app-release.apk"
if [ -f "$APK_SRC" ]; then
  cp "$APK_SRC" "../public/beatdrop-tv.apk"
  cp "$APK_SRC" "../beatdrop-tv.apk"
  echo ""
  echo "🎉 SUCCESS! Standalone Android TV APK compiled:"
  echo "   👉 $(pwd)/../beatdrop-tv.apk"
  echo "   👉 Also hosted on your local Wi-Fi at: http://192.168.1.80:3000/beatdrop-tv.apk"
fi
