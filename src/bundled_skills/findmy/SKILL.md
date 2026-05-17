---
name: findmy
description: Apple cihazlarını ve AirTag'leri FindMy.app ile takip et.
platforms: [macos]
tags: [findmy, airtag, konum, takip, macos, apple]
---

# Find My (Apple)

macOS'taki FindMy.app üzerinden Apple cihazlarını ve AirTag'leri takip et.
Apple'ın FindMy için CLI'ı olmadığından AppleScript + ekran görüntüsü yöntemi kullanılır.

## Ön Koşullar

- **macOS** ve iCloud oturumu açık Find My uygulaması
- Cihazlar/AirTag'ler Find My'da kayıtlı olmalı
- Screen Recording izni: Sistem Ayarları → Gizlilik → Ekran Kaydı
- **Önerilen**: `peekaboo` daha güvenilir UI otomasyonu için:
  `brew install steipete/tap/peekaboo`

## Ne Zaman Kullan

- "Telefon/çanta/anahtar nerede?" soruları
- AirTag konum takibi
- Cihaz konumlarını kontrol etme (iPhone, iPad, Mac, AirPods)

## Yöntem 1: AppleScript + Ekran Görüntüsü (Temel)

```bash
# Find My'ı aç
osascript -e 'tell application "FindMy" to activate'
sleep 3

# Pencere ekran görüntüsü al
screencapture -w -o /tmp/findmy.png
```

Ardından `computer_use` ile görüntüyü analiz et:
```
computer_use(action="capture", mode="vision", app="FindMy")
```

### Sekme Değiştir

```bash
# Cihazlar sekmesi
osascript -e 'tell application "System Events"
  tell process "FindMy"
    click button "Cihazlar" of toolbar 1 of window 1
  end tell
end tell'

# Eşyalar sekmesi (AirTag)
osascript -e 'tell application "System Events"
  tell process "FindMy"
    click button "Eşyalar" of toolbar 1 of window 1
  end tell
end tell'
```

## Yöntem 2: Peekaboo UI Otomasyonu (Önerilen)

```bash
# Find My'ı aç
osascript -e 'tell application "FindMy" to activate'
sleep 3

# UI'ı yakala ve annote et
peekaboo see --app "FindMy" --annotate --path /tmp/findmy-ui.png

# Element ID ile tıkla
peekaboo click --on B3 --app "FindMy"

# Detay görünümünü yakala
peekaboo image --app "FindMy" --path /tmp/findmy-detail.png
```

Ardından `computer_use` ile analiz et:
```
computer_use(action="capture", mode="som", app="FindMy")
```

## AirTag Konum İzleme İş Akışı

```bash
# 1. FindMy'ı Eşyalar sekmesine aç
osascript -e 'tell application "FindMy" to activate'
sleep 3

# 2. AirTag sayfası açık olduğu sürece güncellenir

# 3. Periyodik konum yakala
while true; do
    screencapture -w -o /tmp/findmy-$(date +%H%M%S).png
    sleep 300  # 5 dakikada bir
done
```

## Sınırlılıklar

- FindMy'ın **CLI veya API'ı yok** — UI otomasyonu zorunlu
- AirTag yalnızca FindMy sayfası aktif açıkken güncellenir
- AppleScript UI otomasyonu macOS sürümlerine göre değişebilir

## Kurallar

1. AirTag takibinde FindMy uygulamasını ön planda tut (minimize edildiğinde güncellemeler durur)
2. Görüntü içeriğini okumak için `computer_use capture` kullan
3. Sürekli takip için periyodik capture alan bir cron görevi oluştur
4. Gizliliğe saygı göster — yalnızca kullanıcının sahip olduğu cihazları takip et
