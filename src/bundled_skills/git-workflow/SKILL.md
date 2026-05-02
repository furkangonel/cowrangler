---
name: git-workflow
description: Professional Git branching, commit, and PR workflow following conventional commits
---

# Git Workflow SOP

## Branch Naming Convention
```
feature/<ticket>-short-description    # New features
fix/<ticket>-short-description        # Bug fixes  
chore/<ticket>-short-description      # Maintenance, deps, tooling
docs/<ticket>-short-description       # Documentation only
refactor/<ticket>-short-description   # Code restructuring
hotfix/<ticket>-short-description     # Urgent production fixes
```

## Conventional Commits Format
```
<type>(<scope>): <short description>

[optional body — explain WHY, not what]

[optional footer — BREAKING CHANGE: ..., Closes #123]
```

### Types
| Type | When to use |
|------|-------------|
| `feat` | New user-visible feature |
| `fix` | Bug fix |
| `chore` | Build system, tooling, dependencies |
| `docs` | Documentation changes only |
| `refactor` | Code change that doesn't fix a bug or add a feature |
| `test` | Adding or fixing tests |
| `perf` | Performance improvement |
| `ci` | CI/CD pipeline changes |
| `revert` | Reverts a previous commit |

### Good commit message examples
```
feat(auth): add OAuth2 Google login support

fix(api): handle null response from payment gateway

Closes #892. The gateway returns null instead of an error object
when the card is declined — we now normalize this to a proper error.

chore: upgrade typescript to 5.4 and fix type errors

BREAKING CHANGE: strict null checks now enforced everywhere
```

## Standard Workflow
```bash
# 1. Start from fresh main
git checkout main && git pull

# 2. Create feature branch  
git checkout -b feature/123-add-user-avatar

# 3. Make focused commits as you work
git add -p                          # Stage only what belongs to this commit
git commit -m "feat(users): add avatar upload endpoint"

# 4. Keep branch current with main
git fetch origin && git rebase origin/main

# 5. Before PR: squash if needed
git rebase -i origin/main

# 6. Push and open PR
git push -u origin HEAD
```

## PR Description Template
```markdown
## What
Brief description of what this PR does.

## Why
Why is this change needed? Link to issue/ticket.

## How
Key implementation decisions made and why.

## Testing
How was this tested? What should reviewers verify?

## Screenshots (if UI change)

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No console.log / debug code left
- [ ] Breaking changes documented
```

## Agent Instructions
When helping with Git tasks:
1. Always check `git_status` first to understand the current state
2. Use `git_log` to understand recent history if relevant
3. Suggest conventional commit messages based on the actual changes
4. Warn before any destructive operations (force push, rebase on shared branches)
5. Never commit directly to `main` or `master`
