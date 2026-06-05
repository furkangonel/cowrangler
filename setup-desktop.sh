#!/bin/bash
# Co-Wrangler Desktop — Kurulum scripti
set -e

echo "🤠 Co-Wrangler Desktop kurulum başlıyor..."

# 1. Bağımlılıkları kur
echo "📦 Bağımlılıklar yükleniyor..."
npm install --legacy-peer-deps

# 2. better-sqlite3'ü Electron için yeniden derle
echo "🔨 Native modüller derleniyor..."
npm run desktop:rebuild || echo "⚠️  Rebuild başarısız — devam ediliyor..."

echo ""
echo "✅ Kurulum tamamlandı!"
echo ""
echo "▶  Uygulamayı çalıştırmak için:"
echo "   npm run desktop:dev"
echo ""
echo "📦  Paketlemek için:"
echo "   npm run desktop:pack"
