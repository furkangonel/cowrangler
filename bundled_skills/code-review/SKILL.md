---
name: code-review
description: Systematic code review SOP covering correctness, security, performance, and maintainability — plus GitHub PR review workflow (diff, inline comments, approve via gh/REST).
platforms: [linux, macos, windows]
tags: [code-review, github, pull-requests, git, quality]
---

# Code Review SOP

## Purpose
Perform a structured, thorough code review that catches bugs, security issues, and maintainability problems before they reach production.

## Review Checklist

### 1. Correctness
- [ ] Logic errors and off-by-one mistakes
- [ ] Null/undefined/empty handling at boundaries
- [ ] Correct error propagation (errors not silently swallowed)
- [ ] Race conditions and async/await correctness
- [ ] Edge cases: empty arrays, zero values, maximum values

### 2. Security
- [ ] User input validated and sanitized before use
- [ ] No hardcoded secrets, tokens, or passwords
- [ ] No path traversal vulnerabilities (`../` in file paths)
- [ ] SQL/command injection not possible
- [ ] Authentication/authorization checks in place
- [ ] Sensitive data not logged

### 3. Performance
- [ ] No N+1 query patterns
- [ ] No blocking synchronous I/O in hot paths
- [ ] Large data not loaded into memory unnecessarily
- [ ] Proper use of indexes if database queries involved
- [ ] No unnecessary re-computation in loops

### 4. Maintainability
- [ ] Functions are short and do one thing (SRP)
- [ ] Variable/function names are self-documenting
- [ ] No duplicated logic (DRY principle)
- [ ] Complex logic has explanatory comments
- [ ] Dead code removed
- [ ] Magic numbers replaced with named constants

### 5. Type Safety (TypeScript/typed languages)
- [ ] No `any` types without justification
- [ ] Return types explicitly declared for public functions
- [ ] Nullable types handled correctly
- [ ] No unsafe type casts

### 6. Testing
- [ ] New logic has corresponding tests
- [ ] Edge cases covered in tests
- [ ] Tests are isolated and don't depend on order
- [ ] Mocks are used appropriately

## Output Format
Structure your review as:

```
## Code Review Summary

**Overall Score**: X/10
**Risk Level**: Low / Medium / High / Critical

### Issues Found

#### CRITICAL
- [file:line] Description — Fix: ...

#### MAJOR  
- [file:line] Description — Fix: ...

#### MINOR
- [file:line] Description — Fix: ...

### Positive Observations
- What is done well...

### Recommendation
APPROVE / REQUEST CHANGES / BLOCK
```

## Tone
Be constructive and specific. Explain WHY something is an issue, not just what. Suggest concrete fixes.

---

# GitHub / PR Review Workflow

Use the checklist above to judge *what* is wrong; use this section for *how* to
review local changes before pushing, or open pull requests on GitHub.

## Setup

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

## 1. Review local changes (pre-push)

```bash
git diff main...HEAD --stat                 # big picture
git log main..HEAD --oneline                # commits in the branch
git diff main...HEAD -- src/auth.ts         # file by file

# common smells
git diff main...HEAD | grep -n "console\.log\|TODO\|FIXME\|debugger"
git diff main...HEAD | grep -in "password\|secret\|api_key\|token.*="
git diff main...HEAD | grep -n "<<<<<<\|>>>>>>\|======="
```

## 2. Review a GitHub PR

```bash
gh pr view 123
gh pr diff 123
gh pr checkout 123           # check out locally
```

curl fallback (no gh):
```bash
PR_NUMBER=123
curl -s -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/pulls/$PR_NUMBER/files \
  | python3 -c "import sys,json; [print(f\"+{f['additions']} -{f['deletions']} {f['filename']}\") for f in json.load(sys.stdin)]"
```

## 3. Leave comments & submit a review

```bash
gh pr comment 123 --body "Overall good, a few suggestions."

# inline comment on a specific line
HEAD_SHA=$(gh pr view 123 --json headRefOid --jq '.headRefOid')
gh api repos/$OWNER/$REPO/pulls/123/comments --method POST \
  -f body="Can be simplified with a list comprehension." \
  -f path="src/auth/login.ts" -f commit_id="$HEAD_SHA" -f line=45 -f side="RIGHT"

# formal review
gh pr review 123 --approve --body "LGTM!"
gh pr review 123 --request-changes --body "See inline comments."
gh pr review 123 --comment --body "A few non-blocking suggestions."
```

## 4. Decision

- **Approve** — no critical/warning issues, only minor suggestions.
- **Request changes** — critical/warning issues that must be fixed before merge.
- **Comment** — observations and suggestions, non-blocking (draft PRs).

## Cross-References
- `github-pr-workflow` — opening and managing PRs (not just reviewing).
- `testing` — verifying the change is actually covered by tests.