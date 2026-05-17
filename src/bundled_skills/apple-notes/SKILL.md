---
name: apple-notes
description: Apple Notes'u memo CLI ile yönet — oluştur, ara, düzenle.
platforms: [macos]
tags: [notes, apple, macos, not-alma]
---

# Apple Notes

`memo` CLI aracıyla Apple Notes'u doğrudan terminalden yönet. Notlar iCloud ile tüm Apple cihazlarına senkronize edilir.

## Ön Koşullar

- **macOS** ve Notes.app
- Kur: `brew tap antoniorodr/memo && brew install antoniorodr/memo/memo`
- İstendiğinde Automation erişimi ver: Sistem Ayarları → Gizlilik → Automation

## Ne Zaman Kullan

- Kullanıcı Apple Notes oluşturmak, görüntülemek veya aramak istediğinde
- Cihazlar arası senkron gereken bilgileri kaydetmek için (iPhone/iPad/Mac)
- Notları klasörlere düzenlemek için

## Ne Zaman Kullanma

- Obsidian vault yönetimi → `obsidian` skill'i kullan
- Sadece ajan dahili notlar → `memory` aracını kullan
- Bear Notes → desteklenmiyor

## Hızlı Referans

### Notları Görüntüle

```bash
memo notes                        # Tüm notları listele
memo notes -f "Klasör Adı"       # Klasöre göre filtrele
memo notes -s "sorgu"             # Fuzzy arama
```

### Not Oluştur

```bash
memo notes -a                     # Etkileşimli editör
memo notes -a "Not Başlığı"       # Hızlı oluştur
```

### Not Düzenle

```bash
memo notes -e                     # Etkileşimli seçim ile düzenle
```

### Not Sil

```bash
memo notes -d                     # Etkileşimli seçim ile sil
```

### Not Taşı

```bash
memo notes -m                     # Klasöre taşı (etkileşimli)
```

### Not Dışa Aktar

```bash
memo notes -ex                    # HTML/Markdown'a aktar
```

## Kurallar

1. Cihazlar arası senkron isteniyorsa Apple Notes tercih et
2. Ajan dahili notlar için `memory` aracını kullan
3. Markdown-native bilgi yönetimi için Obsidian kullan
4. Resim/ek içeren notlar düzenlenemez — kullanıcıyı bilgilendir
