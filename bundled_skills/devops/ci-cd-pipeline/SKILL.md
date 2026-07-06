---
name: ci-cd-pipeline
description: Design and implement CI/CD pipelines for automated testing and deployment.
platforms: [linux, macos, windows]
tags: [ci-cd, github-actions, gitlab-ci, devops, automation, deployment, testing, pipeline]
---

# CI/CD Pipeline SOP


## When to Use

- User wants to set up CI/CD for a project
- User asks about GitHub Actions, GitLab CI, CircleCI, or similar tools
- User wants to automate testing, building, or deployment
- User's pipeline is failing and they need to debug it

---

## Part 1 — Pipeline Anatomy

Every solid pipeline has these stages in order:

```
Trigger → Lint → Test → Build → Security Scan → Deploy → Notify
```

| Stage | Purpose | Fail behavior |
|-------|---------|---------------|
| **Lint** | Code style, static analysis | Block PR merge |
| **Test** | Unit + integration tests | Block PR merge |
| **Build** | Compile / package / containerize | Block PR merge |
| **Security Scan** | SAST, dependency audit, secret detection | Block or warn |
| **Deploy: Staging** | Push to staging environment | Block prod deploy |
| **Smoke Test** | Quick sanity check on staging | Block prod deploy |
| **Deploy: Prod** | Production release | Notify team |

---

## Part 2 — GitHub Actions Templates

### Template A — Node.js Full Pipeline

```yaml
name: CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true      # cancel in-flight runs on new push

env:
  NODE_VERSION: "20"
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  # ─── Lint ────────────────────────────────────────────────────────
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check

  # ─── Test ────────────────────────────────────────────────────────
  test:
    name: Unit & Integration Tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: testuser
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: testdb
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"
      - run: npm ci
      - run: npm test -- --coverage
        env:
          DATABASE_URL: postgresql://testuser:testpass@localhost:5432/testdb
      - uses: codecov/codecov-action@v4
        with:
          token: ${{ secrets.CODECOV_TOKEN }}

  # ─── Build & Push Docker Image ───────────────────────────────────
  build:
    name: Build Docker Image
    needs: [lint, test]
    runs-on: ubuntu-latest
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
      image-digest: ${{ steps.build.outputs.digest }}
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=sha-
            type=ref,event=branch
            type=semver,pattern={{version}}
      - uses: docker/build-push-action@v5
        id: build
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ─── Deploy to Staging ───────────────────────────────────────────
  deploy-staging:
    name: Deploy → Staging
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: staging
      url: https://staging.example.com
    if: github.ref == 'refs/heads/develop'
    steps:
      - name: Deploy to staging
        run: |
          echo "Deploying ${{ needs.build.outputs.image-tag }} to staging"
          # kubectl set image deployment/app app=${{ needs.build.outputs.image-tag }}
          # or: ssh deploy@staging "docker pull ... && docker-compose up -d"

  # ─── Deploy to Production ────────────────────────────────────────
  deploy-prod:
    name: Deploy → Production
    needs: [build, deploy-staging]
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://example.com
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to production
        run: |
          echo "Deploying to production"
```

---

### Template B — Matrix Strategy (multi-version testing)

```yaml
jobs:
  test:
    strategy:
      fail-fast: false          # continue other matrix jobs if one fails
      matrix:
        node: ["18", "20", "22"]
        os: [ubuntu-latest, macos-latest]
        exclude:
          - os: macos-latest
            node: "18"         # don't test node 18 on mac
    runs-on: ${{ matrix.os }}
    name: Test (Node ${{ matrix.node }} / ${{ matrix.os }})
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm ci && npm test
```

---

### Template C — Reusable Workflow

```yaml
# .github/workflows/reusable-deploy.yml
name: Reusable Deploy

on:
  workflow_call:
    inputs:
      environment:
        required: true
        type: string
      image-tag:
        required: true
        type: string
    secrets:
      DEPLOY_KEY:
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    steps:
      - name: Deploy ${{ inputs.image-tag }} to ${{ inputs.environment }}
        run: echo "Deploying..."
```

```yaml
# Usage in another workflow:
jobs:
  call-deploy:
    uses: ./.github/workflows/reusable-deploy.yml
    with:
      environment: production
      image-tag: ${{ needs.build.outputs.image-tag }}
    secrets:
      DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
```

---

## Part 3 — Secrets Management

### GitHub Actions Secrets

```yaml
# Access secrets — never echo them
- name: Set up credentials
  env:
    DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
    API_KEY: ${{ secrets.API_KEY }}
  run: ./scripts/configure.sh

# Use environments for different secret scopes
# Settings → Environments → staging / production → Secrets
```

### Secret Scanning

Add to your pipeline to prevent secret leaks:

```yaml
- name: Scan for secrets
  uses: trufflesecurity/trufflehog@main
  with:
    path: ./
    base: ${{ github.event.repository.default_branch }}
    head: HEAD
```

### Rules for Secrets
- Never hardcode secrets in workflow files
- Never `echo $SECRET` or print to logs
- Rotate secrets if a workflow run is public and accidentally logged one
- Use `${{ secrets.NAME }}` — GitHub automatically masks these in logs

---

## Part 4 — Deployment Strategies

### Rolling Update (Kubernetes)
```bash
kubectl set image deployment/app app=ghcr.io/myorg/app:sha-abc123
kubectl rollout status deployment/app
kubectl rollout undo deployment/app  # if something goes wrong
```

### Blue-Green
```yaml
# Maintain two identical environments; switch traffic via load balancer
steps:
  - name: Deploy to Green
    run: deploy.sh green ${{ env.IMAGE_TAG }}
  - name: Smoke test Green
    run: curl -f https://green.example.com/health
  - name: Switch traffic to Green
    run: switch-traffic.sh green
  - name: Keep Blue on standby for rollback
```

### Canary (Argo Rollouts / Flagger)
```yaml
# Route 10% of traffic to new version, gradually increase
canary:
  steps:
    - setWeight: 10
    - pause: { duration: 5m }
    - setWeight: 50
    - pause: { duration: 10m }
    - setWeight: 100
```

---

## Part 5 — Common Failure Patterns and Fixes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Tests pass locally, fail in CI | Missing env var or service | Add service container or secret |
| Build slow (> 5min for npm ci) | No caching configured | Add `cache: "npm"` to setup-node |
| Docker push fails | Not logged in to registry | Add `docker/login-action` step |
| Deploy triggers on wrong branch | `if:` condition missing | Add `if: github.ref == 'refs/heads/main'` |
| Old job still running after new push | No concurrency config | Add `concurrency.cancel-in-progress: true` |
| Pipeline succeeds but app is broken | No smoke test | Add health check step after deploy |

---

## Agent Instructions

1. Ask the user which CI platform they're using (GitHub Actions, GitLab CI, CircleCI, etc.) before generating config
2. Ask what languages and deployment targets are involved
3. Always include caching for dependency installation — it's the biggest speed win
4. Never put secrets in workflow files — always use `secrets.*`
5. Add `concurrency` at the top level to avoid wasted runs
6. Suggest adding a smoke test / health check after every deployment step
7. Use `environment:` with approval gates for production deploys
