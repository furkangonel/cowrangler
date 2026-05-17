---
name: github-issues
description: GitHub issue'larını gh veya REST ile oluştur, sırala, etiketle, ata.
platforms: [linux, macos, windows]
tags: [github, issues, proje-yönetimi, hata-takibi]
---

# GitHub Issues Yönetimi

Issue oluştur, ara, sırala ve yönet. Her bölüm önce `gh`, ardından `curl` geri dönüş yolunu gösterir.

## Ön Koşullar

- GitHub'a kimlik doğrulama yapılmış
- GitHub remote'u olan bir git deposunun içinde (veya repo açıkça belirtilmiş)

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

## 1. Issue'ları Görüntüle

**gh ile:**
```bash
gh issue list
gh issue list --state open --label "bug"
gh issue list --assignee @me
gh issue list --search "kimlik doğrulama hatası" --state all
gh issue view 42
```

**curl ile:**
```bash
curl -s -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/$OWNER/$REPO/issues?state=open&per_page=20" \
  | python3 -c "
import sys, json
for i in json.load(sys.stdin):
    if 'pull_request' not in i:
        labels = ', '.join(l['name'] for l in i['labels'])
        print(f\"#{i['number']:5}  {i['state']:6}  {labels:20}  {i['title']}\")"

# Label'a göre filtrele
curl -s -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/$OWNER/$REPO/issues?state=open&labels=bug&per_page=20" \
  | python3 -c "import sys,json; [print(f\"#{i['number']} {i['title']}\") for i in json.load(sys.stdin) if 'pull_request' not in i]"
```

---

## 2. Issue Oluştur

**gh ile:**
```bash
gh issue create \
  --title "Hata: Giriş sayfası yanlış yönlendiriyor" \
  --body "## Sorun
Giriş sonrası /dashboard yerine / adresine yönlendiriyor.

## Yeniden Üretme Adımları
1. /login adresine git
2. Geçerli kimlik bilgileriyle giriş yap
3. / adresine yönlendirildiğini gözlemle

## Beklenen Davranış
/dashboard adresine yönlendirilmeli

## Ortam
- Tarayıcı: Chrome 120
- OS: macOS" \
  --label "bug" \
  --assignee "@me"
```

**curl ile:**
```bash
curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/$OWNER/$REPO/issues \
  -d "{
    \"title\": \"Hata: Giriş sayfası yanlış yönlendiriyor\",
    \"body\": \"## Sorun\nGiriş sonrası / adresine yönlendiriyor.\",
    \"labels\": [\"bug\"],
    \"assignees\": [\"kullanici-adi\"]
  }"
```

---

## 3. Issue Güncelle

**gh ile:**
```bash
gh issue edit 42 --title "Yeni başlık"
gh issue edit 42 --add-label "öncelik: yüksek"
gh issue edit 42 --remove-label "öncelik: düşük"
gh issue edit 42 --add-assignee "kullanici-adi"
gh issue close 42 --comment "Düzeltildi — PR #89'da."
gh issue reopen 42
```

**curl ile:**
```bash
ISSUE_NUMBER=42

# Başlık/gövde güncelle
curl -s -X PATCH -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/issues/$ISSUE_NUMBER \
  -d '{"title": "Yeni başlık", "state": "closed"}'

# Label ekle
curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/issues/$ISSUE_NUMBER/labels \
  -d '{"labels": ["öncelik: yüksek"]}'

# Label kaldır
curl -s -X DELETE -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/$OWNER/$REPO/issues/$ISSUE_NUMBER/labels/öncelik%3A%20düşük"
```

---

## 4. Issue Yorumu

**gh ile:**
```bash
gh issue comment 42 --body "Araştırıyorum, yarına kadar güncelleme geliyor."
```

**curl ile:**
```bash
curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/issues/42/comments \
  -d '{"body": "Araştırıyorum."}'
```

---

## 5. Issue Sıralama İş Akışı

Yeni bir issue raporu geldiğinde:

1. **Çoğalt** — varsa yeniden üretme adımlarını dene
2. **Kategorize et** — Bug / Feature / Enhancement / Question
3. **Önem seviyesi ata** — Critical / High / Medium / Low
4. **Label ekle** — `bug`, `enhancement`, `documentation`, `needs-triage` vb.
5. **Kişiye ata** — uygun ekip üyesine
6. **Milestone'a bağla** — uygunsa `gh issue edit N --milestone "v2.1"`
7. **Yorum yaz** — triage sonucunu belgele

---

## 6. Yararlı Filtreler

```bash
# Benim issue'larım
gh issue list --assignee @me --state open

# Belirli milestone
gh issue list --milestone "v2.0"

# Atanmamış bug'lar
gh issue list --label "bug" --no-assignee --state open

# Son 7 günde oluşturulan
gh issue list --search "created:>$(date -d '7 days ago' +%Y-%m-%d 2>/dev/null || date -v-7d +%Y-%m-%d)"

# Belirli keyword ile ara
gh issue list --search "bellek sızıntısı" --state all
```
