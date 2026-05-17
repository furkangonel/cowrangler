---
name: imessage
description: macOS'ta imsg CLI ile iMessage/SMS gönder ve oku.
platforms: [macos]
tags: [imessage, sms, mesajlaşma, macos, apple]
---

# iMessage

`imsg` CLI aracıyla macOS Messages.app üzerinden iMessage/SMS oku ve gönder.

## Ön Koşullar

- **macOS** ve oturum açılmış Messages.app
- Kur: `brew install steipete/tap/imsg`
- Tam Disk Erişimi ver: Sistem Ayarları → Gizlilik → Tam Disk Erişimi
- İstendiğinde Messages.app için Automation izni ver

## Ne Zaman Kullan

- Kullanıcı iMessage veya SMS göndermek istediğinde
- iMessage konuşma geçmişini okumak için
- Son Messages.app sohbetlerini kontrol etmek için

## Ne Zaman Kullanma

- Telegram/Discord/Slack/WhatsApp → ilgili gateway kanalını kullan
- Grup sohbeti yönetimi (üye ekleme/çıkarma) → desteklenmiyor
- Toplu/kitlesel mesajlaşma → kullanıcıyı **her zaman** önce onayla

## Hızlı Referans

### Sohbetleri Listele

```bash
imsg chats --limit 10 --json
```

### Geçmişi Görüntüle

```bash
imsg history --chat-id 1 --limit 20 --json
imsg history --chat-id 1 --limit 20 --attachments --json
```

### Mesaj Gönder

```bash
# Yalnızca metin
imsg send --to "+905551234567" --text "Merhaba!"

# Ek ile
imsg send --to "+905551234567" --text "Bak bunu" --file /path/to/image.jpg

# iMessage veya SMS zorla
imsg send --to "+905551234567" --text "Merhaba" --service imessage
imsg send --to "+905551234567" --text "Merhaba" --service sms
```

### Yeni Mesajları İzle

```bash
imsg watch --chat-id 1 --attachments
```

## Servis Seçenekleri

- `--service imessage` → iMessage zorla (alıcının iMessage'ı olması gerekir)
- `--service sms` → SMS zorla (yeşil balon)
- `--service auto` → Messages.app karar versin (varsayılan)

## Kurallar

1. **Göndermeden önce alıcıyı ve mesaj içeriğini her zaman onayla**
2. **Bilinmeyen numaralara** kullanıcı açık onayı olmadan gönderme
3. Eklemeden önce dosya yollarının var olduğunu doğrula
4. **Spam gönderme** — hız sınırı uygula

## Örnek İş Akışı

Kullanıcı: "Anneme geç kalacağımı mesaj at"

```bash
# 1. Annenin sohbetini bul
imsg chats --limit 20 --json | grep -i "anne\|anne"

# 2. Kullanıcıyla onayla: "+905551234567 - Anne bulundu. 'Geç kalacağım' göndereceğim, onaylıyor musunuz?"

# 3. Onaydan sonra gönder
imsg send --to "+905551234567" --text "Geç kalacağım"
```
