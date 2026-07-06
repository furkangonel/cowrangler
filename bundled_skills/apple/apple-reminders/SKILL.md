---
name: apple-reminders
description: Apple Reminders'ı remindctl ile yönet — ekle, listele, tamamla.
platforms: [macos]
tags: [reminders, görevler, todo, macos, apple]
---

# Apple Reminders

`remindctl` CLI aracıyla Apple Reminders'ı doğrudan terminalden yönet. Görevler iCloud ile iPhone/iPad/Mac'e senkronize edilir.

## Ön Koşullar

- **macOS** ve Reminders.app
- Kur: `brew install steipete/tap/remindctl`
- İstendiğinde Reminders iznini ver
- Kontrol: `remindctl status` / İzin iste: `remindctl authorize`

## Ne Zaman Kullan

- Kullanıcı "hatırlatıcı" veya "Reminders uygulaması" dediğinde
- iOS'a senkronize olacak kişisel görevler oluştururken
- Apple Reminders listelerini yönetirken

## Ne Zaman Kullanma

- Ajan zamanlamaları → `cron` aracını kullan
- Takvim etkinlikleri → Apple Calendar veya Google Calendar
- Proje görev yönetimi → GitHub Issues vb.
- Kullanıcı "hatırlat" diyorsa ajan uyarısı mı yoksa Apple Reminders mı istediğini **önce sor**

## Hızlı Referans

### Hatırlatıcıları Görüntüle

```bash
remindctl                    # Bugünkü hatırlatıcılar
remindctl today              # Bugün
remindctl tomorrow           # Yarın
remindctl week               # Bu hafta
remindctl overdue            # Geçmiş tarihli
remindctl all                # Tümü
remindctl 2026-06-15         # Belirli tarih
```

### Listeleri Yönet

```bash
remindctl list               # Tüm listeleri göster
remindctl list İş            # Belirli listeyi göster
remindctl list Projeler --create    # Liste oluştur
remindctl list İş --delete         # Liste sil
```

### Hatırlatıcı Oluştur

```bash
remindctl add "Süt al"
remindctl add --title "Annemi ara" --list Kişisel --due tomorrow
remindctl add --title "Toplantı hazırlığı" --due "2026-02-15 09:00"
```

### Tamamla / Sil

```bash
remindctl complete 1 2 3          # ID ile tamamla
remindctl delete 4A83 --force     # ID ile sil
```

### Çıktı Formatları

```bash
remindctl today --json       # Scripting için JSON
remindctl today --plain      # TSV formatı
remindctl today --quiet      # Yalnızca sayılar
```

## Tarih Formatları

`--due` ve filtreler için:
- `today`, `tomorrow`, `yesterday`
- `YYYY-MM-DD`
- `YYYY-MM-DD HH:mm`
- ISO 8601 (`2026-01-04T12:34:56Z`)

## Kurallar

1. "Hatırlat" denildiğinde netleştir: Apple Reminders (telefona senkronize) mi yoksa ajan cronjob uyarısı mı?
2. Oluşturmadan önce içerik ve tarihi onayla
3. Programatik ayrıştırma için `--json` kullan
