---
name: github-code-review
description: PR'ları incele — diff, inline yorum, gh veya REST ile onayla.
platforms: [linux, macos, windows]
tags: [github, kod-inceleme, pull-requests, git, kalite]
---

# GitHub Kod İnceleme

Push öncesi yerel değişiklikleri veya GitHub'daki açık PR'ları incele.

## Ön Koşullar

- GitHub'a kimlik doğrulama yapılmış
- Git deposunun içinde

### Kurulum

```bash
if command -v gh &>/dev/null && gh auth status &>/dev/null; then
  AUTH="gh"
else
  AUTH="git"
  GITHUB_TOKEN=$(grep "^GITHUB_TOKEN=" ~/.cowrangler/credentials.env 2>/dev/null | head -1 | cut -d= -f2)
fi
REMOTE_URL=$(git remote get-url origin)
OWNER_REPO=$(echo "$REMOTE_URL" | sed -E 's|.*github\.com[:/]||; s|\.git$||')
OWNER=$(echo "$OWNER_REPO" | cut -d/ -f1)
REPO=$(echo "$OWNER_REPO" | cut -d/ -f2)
```

---

## 1. Yerel Değişiklikleri İncele (Push Öncesi)

### Diff Al

```bash
git diff --staged                    # Staged değişiklikler
git diff main...HEAD                 # PR'ın tamamı
git diff main...HEAD --name-only     # Yalnızca dosya adları
git diff main...HEAD --stat          # Özet istatistik
```

### İnceleme Stratejisi

```bash
# 1. Büyük resme bak
git diff main...HEAD --stat
git log main..HEAD --oneline

# 2. Dosya dosya incele
git diff main...HEAD -- src/auth.ts

# 3. Yaygın sorunları kontrol et
git diff main...HEAD | grep -n "console\.log\|TODO\|FIXME\|debugger"
git diff main...HEAD | grep -in "password\|secret\|api_key\|token.*="
git diff main...HEAD | grep -n "<<<<<<\|>>>>>>\|======="
```

### İnceleme Çıktı Formatı

```
## Kod İnceleme Özeti

### 🔴 Kritik
- **src/auth.ts:45** — SQL injection: kullanıcı girdisi doğrudan sorguya geçiyor.

### ⚠️ Uyarılar
- **src/models/user.ts:23** — Şifre düz metin olarak saklanıyor. bcrypt kullan.

### 💡 Öneriler
- **src/utils/helpers.ts:8** — src/core/utils.ts:34 ile aynı mantık. Birleştir.

### ✅ İyi Görünüyor
- Middleware katmanında temiz ayrım
- Happy path için iyi test kapsamı
```

---

## 2. GitHub PR İnceleme

### PR Detaylarını Görüntüle

**gh ile:**
```bash
gh pr view 123
gh pr diff 123
gh pr diff 123 --name-only
```

**curl ile:**
```bash
PR_NUMBER=123
curl -s -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/pulls/$PR_NUMBER \
  | python3 -c "import sys,json; pr=json.load(sys.stdin); print(f\"{pr['title']} by {pr['user']['login']}\")"

# Değişen dosyalar
curl -s -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/pulls/$PR_NUMBER/files \
  | python3 -c "import sys,json; [print(f\"+{f['additions']} -{f['deletions']} {f['filename']}\") for f in json.load(sys.stdin)]"
```

### PR'ı Lokal Checkout Et

```bash
git fetch origin pull/123/head:pr-123
git checkout pr-123
git diff main...pr-123
```

**gh ile:**
```bash
gh pr checkout 123
```

### Yorum Bırak

**gh ile:**
```bash
gh pr comment 123 --body "Genel olarak iyi, birkaç öneri var."
```

**curl ile:**
```bash
curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/issues/$PR_NUMBER/comments \
  -d '{"body": "Genel olarak iyi görünüyor."}'
```

### Inline Yorum Ekle

**gh ile:**
```bash
HEAD_SHA=$(gh pr view 123 --json headRefOid --jq '.headRefOid')
gh api repos/$OWNER/$REPO/pulls/123/comments \
  --method POST \
  -f body="List comprehension ile sadeleştirilebilir." \
  -f path="src/auth/login.ts" \
  -f commit_id="$HEAD_SHA" \
  -f line=45 \
  -f side="RIGHT"
```

### Resmi İnceleme Gönder

**gh ile:**
```bash
gh pr review 123 --approve --body "LGTM!"
gh pr review 123 --request-changes --body "Inline yorumlara bakın."
gh pr review 123 --comment --body "Birkaç öneri, engelleyici değil."
```

**curl ile:**
```bash
HEAD_SHA=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/pulls/$PR_NUMBER \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['head']['sha'])")

curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/pulls/$PR_NUMBER/reviews \
  -d "{
    \"commit_id\": \"$HEAD_SHA\",
    \"event\": \"REQUEST_CHANGES\",
    \"body\": \"2 sorun, 1 öneri. Inline yorumlara bakın.\",
    \"comments\": [
      {\"path\": \"src/auth.ts\", \"line\": 45, \"body\": \"🔴 SQL injection riski.\"},
      {\"path\": \"src/models.ts\", \"line\": 23, \"body\": \"⚠️ Şifre hashlenmeden saklanıyor.\"}
    ]
  }"
```

---

## 3. İnceleme Kontrol Listesi

### Doğruluk
- Kod iddia ettiğini yapıyor mu?
- Edge case'ler (boş giriş, null, büyük veri, eşzamanlı erişim)?
- Hata yolları düzgün işleniyor mu?

### Güvenlik
- Hardcoded secret/API anahtarı yok mu?
- Kullanıcı girdilerinde doğrulama var mı?
- SQL injection, XSS, path traversal riski yok mu?
- Gerekli yerlerde auth/authz kontrolü var mı?

### Kod Kalitesi
- Açık isimlendirme?
- Gereksiz karmaşıklık yok mu?
- DRY — çoğaltılmış mantık çıkarılmış mı?

### Test
- Yeni kod yolları test edilmiş mi?
- Happy path ve hata durumları kapsanıyor mu?

### Performans
- N+1 sorgu veya gereksiz döngü yok mu?
- Async kod yollarında blocking işlem yok mu?

---

## 4. Karar: Onayla / Değişiklik İste / Yorum

- **Onayla** — kritik veya uyarı seviyesi sorun yok, yalnızca küçük öneriler
- **Değişiklik İste** — merge öncesi düzeltilmesi gereken kritik/uyarı seviyesi sorun var
- **Yorum** — gözlemler ve öneriler, engelleyici değil (taslak PR'lar için)
