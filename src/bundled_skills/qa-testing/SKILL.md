---
name: qa-testing
description: Web uygulamalarını keşif QA'sı ile test et — hata bul, kanıt topla, rapor yaz.
platforms: [linux, macos, windows]
tags: [qa, test, browser, web, hata-bulma]
---

# Web Uygulaması QA Testi

Web uygulamalarında sistematik keşif testi yaparak hata bul, kanıt topla ve yapılandırılmış rapor oluştur.

## Ne Zaman Kullan

- "Bu uygulamayı test et / dene"
- "Hata var mı bak"
- Kullanıcı arayüzü veya API değişikliklerini doğrulama
- Yeni bir özelliği production öncesi inceleme

## İş Akışı (5 Aşama)

### Aşama 1: Plan

Başlamadan önce kapsam belirle:
- Hangi URL / özellik alanı test edilecek?
- Hangi tarayıcı/cihaz hedefleniyor?
- Giriş kimlik bilgileri / test verileri mevcut mu?
- Kapsam dışı ne var?

### Aşama 2: Keşfet

Uygulamada sistematik dolaş:

```
# Ana akışları izle
browser_navigate(url="https://app.example.com")
browser_snapshot()          # Mevcut durumu gör

# Kritik yolları test et: kayıt, giriş, ana özellik, ödeme vb.
browser_click(selector="button[type=submit]")
browser_type(selector="input[name=email]", text="test@example.com")

# Konsol hatalarını kontrol et
browser_console()           # JS hataları / uyarıları

# Her adımdan sonra snapshot al
browser_snapshot()
```

**Test edilecekler:**
- Tüm navigasyon linkleri ve butonlar
- Form gönderimi (geçerli + geçersiz girdiler)
- Hata mesajları ve doğrulama
- Sayfa yüklenme hızı
- Responsive davranış (farklı viewport genişlikleri)
- Boş state'ler (veri yok, yeni kullanıcı)

### Aşama 3: Kanıt Topla

Her hata için:
- Ekran görüntüsü al ve kaydet
- Tam yeniden üretme adımlarını belgele
- Hata mesajları / konsol çıktılarını kaydet
- Ortam bilgisi not et (tarayıcı, URL, kullanıcı durumu)

### Aşama 4: Kategorize Et

Her hatayı şu kriterlere göre sınıflandır:

**Önem Seviyesi:**
- 🔴 **Kritik** — Temel işlevselliği engelliyor (giriş yapılamıyor, ödeme çalışmıyor, veri kaybı)
- 🟠 **Yüksek** — Önemli özelliği etkiliyor ama geçici çözüm var
- 🟡 **Orta** — Kullanıcı deneyimini etkiliyor ama kritik değil
- 🟢 **Düşük** — Kozmetik sorun, küçük UI tutarsızlığı

**Kategori:**
- Fonksiyonel (yanlış davranış)
- UI/UX (görsel sorun, kullanılabilirlik)
- Performans (yavaş yükleme, zaman aşımı)
- Güvenlik (XSS, açık uç noktalar)
- Erişilebilirlik (eksik aria label, klavye navigasyonu)

### Aşama 5: Rapor

Yapılandırılmış hata raporu oluştur:

```markdown
# QA Test Raporu — [Uygulama Adı]
**Tarih:** [bugün]
**Test Kapsamı:** [test edilen özellikler]
**Ortam:** [URL, tarayıcı]
**Toplam Hata:** X (Kritik: N, Yüksek: N, Orta: N, Düşük: N)

---

## 🔴 Kritik Hatalar

### BUG-001: [Başlık]
- **Adımlar:** 1. ... 2. ... 3. ...
- **Beklenen:** ...
- **Gerçekleşen:** ...
- **Kanıt:** [ekran görüntüsü / log]

## 🟠 Yüksek Öncelikli Hatalar
...

## ✅ Çalışıyor
- [Test edilen ve geçen özellikler]
```

## Yararlı Test Kalıpları

### Form Doğrulama Testi

```
# Boş form gönder
# Çok uzun girdiler (1000+ karakter)
# Özel karakterler: <script>, ', ", &, ;
# Geçersiz email formatları
# Negatif sayılar / sıfır
# Gelecek/geçmiş tarihler
```

### Kimlik Doğrulama Testi

```
# Geçersiz kimlik bilgileriyle giriş
# Oturum zaman aşımı davranışı
# Giriş yapılmadan korumalı sayfalara direkt erişim
# Şifre sıfırlama akışı
# "Beni hatırla" işlevselliği
```

### Hız/Güvenilirlik Testi

```
# Yavaş ağda (browser devtools ile throttle)
# Çok hızlı çift tıklama (duplicate submit)
# Geri butonu davranışı form gönderisi sonrası
# Tarayıcı yenilemesi işlem ortasında
```

## Kurallar

1. Her önemli adımdan sonra snapshot al — kanıt olmadan hata geçersizdir
2. Yeniden üretme adımları en az 3 kez çalışmalı
3. Tahminde bulunma — ekran görüntüsü al, gözlemle, belgele
4. Önce kritik hatalar, sonra diğerleri — kapsam odaklı tut
5. Pozitif test de yap — çalışanları da belgele
