#!/usr/bin/env bash
# Cowrangler Desktop — yerel paketleme scripti.
# Mevcut işletim sistemi için dağıtılabilir uygulama üretir (release/ klasörüne).
#
#   macOS   -> .dmg + .zip (arm64 + x64)
#   Linux   -> .AppImage  (x64)
#   Windows -> .exe NSIS installer  (Git Bash / WSL)
#
# Kullanım:  npm run desktop:release   (veya: bash scripts/release-desktop.sh)
set -e

echo "🤠 Cowrangler Desktop paketleme başlıyor..."

# 1. Bağımlılıklar
if [ ! -d node_modules ]; then
  echo "📦 Bağımlılıklar yükleniyor..."
  npm install --legacy-peer-deps
fi

# 2. Native modülü Electron ABI'sine göre derle
echo "🔨 Native modüller (better-sqlite3) Electron için derleniyor..."
npm run desktop:rebuild || npx @electron/rebuild -f -w better-sqlite3

# 3. Renderer + main + preload bundle
echo "🏗  Uygulama derleniyor (electron-vite build)..."
npm run desktop:build

# 4. Paketle (electron-builder). Yerelde publish YAPMAZ.
echo "📦 electron-builder ile paketleniyor..."
npx electron-builder --publish never

echo ""
echo "✅ Tamamlandı. Çıktılar: release/"
ls -lh release 2>/dev/null | grep -Ei '\.(dmg|zip|appimage|exe)$' || true
