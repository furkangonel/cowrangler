---
name: github-pr-workflow
description: GitHub PR yaşam döngüsü — branch, commit, aç, CI izle, merge et.
platforms: [linux, macos, windows]
tags: [github, pull-requests, ci/cd, git, otomasyon, merge]
---

# GitHub Pull Request İş Akışı

PR yaşam döngüsünü yönetmek için kapsamlı rehber. Her bölüm önce `gh` CLI yolunu, ardından `git` + `curl` geri dönüş yolunu gösterir.

## Ön Koşullar

- GitHub'a kimlik doğrulama yapılmış (`gh auth login` veya `GITHUB_TOKEN` env değişkeni)
- GitHub remote'u olan bir git deposunun içinde

### Auth Algılama

```bash
if command -v gh &>/dev/null && gh auth status &>/dev/null; then
  AUTH="gh"
else
  AUTH="git"
  if [ -z "$GITHUB_TOKEN" ]; then
    GITHUB_TOKEN=$(grep "^GITHUB_TOKEN=" ~/.cowrangler/credentials.env 2>/dev/null | head -1 | cut -d= -f2 | tr -d '\n\r')
  fi
fi

REMOTE_URL=$(git remote get-url origin)
OWNER_REPO=$(echo "$REMOTE_URL" | sed -E 's|.*github\.com[:/]||; s|\.git$||')
OWNER=$(echo "$OWNER_REPO" | cut -d/ -f1)
REPO=$(echo "$OWNER_REPO" | cut -d/ -f2)
```

---

## 1. Branch Oluştur

```bash
git fetch origin
git checkout main && git pull origin main
git checkout -b feat/kullanici-girisi-ekle
```

Branch isimlendirme:
- `feat/açıklama` — yeni özellikler
- `fix/açıklama` — hata düzeltmeleri
- `refactor/açıklama` — yeniden yapılandırma
- `docs/açıklama` — belgeler
- `ci/açıklama` — CI/CD değişiklikleri

## 2. Commit

```bash
git add src/auth.ts tests/auth.test.ts
git commit -m "feat: JWT tabanlı kullanıcı kimlik doğrulaması ekle

- Giriş/kayıt endpoint'leri eklendi
- Şifre hashleme ile User modeli eklendi
- Korumalı route'lar için auth middleware eklendi"
```

**Conventional Commits formatı:**
```
type(scope): kısa açıklama

Gerekirse uzun açıklama. 72 karakterde sar.
```
Tipler: `feat`, `fix`, `refactor`, `docs`, `test`, `ci`, `chore`, `perf`

## 3. Push ve PR Oluştur

```bash
git push -u origin HEAD
```

**gh ile:**
```bash
gh pr create \
  --title "feat: JWT tabanlı kullanıcı kimlik doğrulaması" \
  --body "## Özet
- Giriş/kayıt API endpoint'leri
- JWT token üretimi ve doğrulaması

## Test Planı
- [ ] Birim testleri geçiyor

Closes #42"
```

**curl ile:**
```bash
BRANCH=$(git branch --show-current)
curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/$OWNER/$REPO/pulls \
  -d "{\"title\":\"feat: JWT kimlik doğrulaması\",\"body\":\"Closes #42\",\"head\":\"$BRANCH\",\"base\":\"main\"}"
```

## 4. CI Durumunu İzle

**gh ile:**
```bash
gh pr checks          # Anlık kontrol
gh pr checks --watch  # Tamamlanana kadar izle
```

**curl ile:**
```bash
SHA=$(git rev-parse HEAD)
curl -s -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/commits/$SHA/status \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['state'])"
```

## 5. CI Hatalarını Otomatik Düzelt

CI başarısız olduğunda şu döngüyü izle:

1. CI durumunu kontrol et → hataları tespit et
2. Hata loglarını oku → sorunu anla
3. `read_file` + `patch`/`write_file` → kodu düzelt
4. `git add . && git commit -m "fix: ..." && git push`
5. CI'ı bekle → durumu tekrar kontrol et
6. Hala başarısız → 3 deneme sonra kullanıcıya sor

**gh ile log okuma:**
```bash
gh run list --branch $(git branch --show-current) --limit 5
gh run view <RUN_ID> --log-failed
```

## 6. Merge

**gh ile:**
```bash
gh pr merge --squash --delete-branch
gh pr merge --auto --squash --delete-branch  # CI geçince otomatik merge
```

**curl ile:**
```bash
PR_NUMBER=<numara>
curl -s -X PUT \
  -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/pulls/$PR_NUMBER/merge \
  -d "{\"merge_method\":\"squash\",\"commit_title\":\"feat: kimlik doğrulaması (#$PR_NUMBER)\"}"

# Branch sil
BRANCH=$(git branch --show-current)
git push origin --delete $BRANCH
git checkout main && git pull origin main && git branch -d $BRANCH
```

## Yararlı PR Komutları

| Aksiyon | gh | curl |
|---------|-----|------|
| PR'larımı listele | `gh pr list --author @me` | `curl ... /pulls?state=open` |
| Diff görüntüle | `gh pr diff` | `git diff main...HEAD` |
| Yorum ekle | `gh pr comment N --body "..."` | `curl -X POST .../issues/N/comments` |
| İnceleme iste | `gh pr edit N --add-reviewer kullanici` | `curl -X POST .../requested_reviewers` |
| PR kapat | `gh pr close N` | `curl -X PATCH .../pulls/N -d '{"state":"closed"}'` |
| PR'ı checkout et | `gh pr checkout N` | `git fetch origin pull/N/head:pr-N && git checkout pr-N` |
