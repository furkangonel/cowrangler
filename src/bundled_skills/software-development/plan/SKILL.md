---
name: plan
description: Structured technical planning before implementation — architecture and task breakdown.
platforms: [linux, macos, windows]
tags: [planning, architecture, design, decomposition, adr, technical-design, requirements]
---

# Technical Planning SOP

A structured process for understanding what to build, how to build it, and what could go wrong — before writing a single line of production code.

## When to Use

- User wants to plan a new feature before implementing it
- User needs to design a system or subsystem from scratch
- User wants to break down a complex task into implementable steps
- User needs to make and record an architecture decision
- User is unsure where to start on a non-trivial problem

---

## The Planning Process

```
1. UNDERSTAND  →  2. EXPLORE  →  3. DESIGN  →  4. DECOMPOSE  →  5. RISK
```

Do not skip steps. Each phase has a defined output.

---

## Phase 1 — Understand

**Goal:** Nail down what "done" looks like before touching the design.

Questions to answer:

1. What problem does this solve? (user story or job-to-be-done)
2. Who are the users and what do they need to do?
3. What are the explicit success criteria? (how do we know this is working?)
4. What are the explicit constraints? (budget, timeline, stack, team size, compliance)
5. What is explicitly OUT of scope?
6. Is there an existing system this must integrate with?

**Output template:**

```markdown
## Problem Statement
[One paragraph: who has this problem, what is the problem, what is the impact]

## Success Criteria
- [ ] User can do X in under Y seconds
- [ ] System handles Z requests/sec without degradation
- [ ] Error rate < 0.1% for operation W

## Constraints
- Must use existing PostgreSQL database
- Must deploy on current Kubernetes cluster
- No new external service dependencies without security review

## Out of Scope
- Admin panel (separate ticket)
- Mobile app changes (v2)
```

---

## Phase 2 — Explore

**Goal:** Understand the existing system before proposing changes.

Actions:
1. Read relevant existing code (don't rely on memory)
2. Identify all call sites for code being changed
3. Map data flows: where does the data come from, where does it go?
4. Check for related tests — understand the existing contract
5. Read any existing ADRs or design docs for context

**Output:** A one-paragraph "current state" summary and a list of files/modules involved.

```markdown
## Current State
The user authentication flow lives in `auth/` and is called by:
- `api/routes/login.ts` (REST endpoint)
- `gateway/ws_auth.ts` (WebSocket upgrade)
- `cli/commands/login.ts` (CLI)

Session tokens are stored in Redis (`services/session_store.ts`).
Token validation happens in `middleware/auth.ts`.

## Files Involved
- `auth/` (core logic)
- `middleware/auth.ts`
- `services/session_store.ts`
- `tests/auth/` (existing test suite, ~40 tests)
```

---

## Phase 3 — Design

**Goal:** Produce a concrete design with enough detail that implementation is unambiguous.

### Design Template

```markdown
## Approach
[2-3 sentences: the chosen approach and why it was chosen over alternatives]

## Data Model Changes
| Table/Schema | Change | Reason |
|---|---|---|
| `users` | Add `mfa_secret VARCHAR(64)` | Store TOTP secret |
| `sessions` | Add `mfa_verified BOOLEAN DEFAULT false` | Track MFA state |

## API Changes
| Endpoint | Method | Change |
|---|---|---|
| `/auth/login` | POST | Now returns `mfa_required: bool` |
| `/auth/mfa/verify` | POST | NEW — accepts TOTP code |

## Sequence Diagram (text)
1. Client → POST /auth/login → Server returns { token: "...", mfa_required: true }
2. Client → POST /auth/mfa/verify { code: "123456" } → Server validates TOTP
3. Server marks session as mfa_verified → Client gets final session token

## Alternatives Considered
| Option | Pros | Cons | Rejected because |
|---|---|---|---|
| SMS OTP | Familiar to users | Carrier dependency, SIM-swap risk | Security requirement |
| Email OTP | Simple implementation | Slow, email reliability | UX requirement (< 5s) |
| TOTP (chosen) | Works offline, industry standard | Requires authenticator app | — |
```

### Architecture Decision Record (ADR) Format

For decisions that will be hard to reverse:

```markdown
# ADR-042: Use PostgreSQL for job queue instead of Redis

**Status:** Accepted
**Date:** 2026-05-18
**Deciders:** @alice, @bob

## Context
We need a durable job queue for async email sending. Currently using Redis for sessions.

## Decision
Use PostgreSQL advisory locks + a `jobs` table instead of adding a Redis queue dependency.

## Consequences
- Positive: No new infrastructure dependency; jobs survive Redis restarts
- Positive: Full ACID guarantees on job state transitions
- Negative: Higher polling latency vs Redis pub/sub (acceptable: emails are not real-time)
- Negative: Slightly more complex implementation

## Rejected Alternatives
- **Redis Bull/BullMQ:** Would work but adds Redis as a hard dependency for a non-critical path
- **SQS:** Introduces AWS dependency; overkill for current volume
```

---

## Phase 4 — Decompose

**Goal:** Break the design into tasks that a single engineer can complete in under 2 days each.

### Task Breakdown Table

```markdown
## Task List

| # | Task | Size | Depends on | Notes |
|---|------|------|------------|-------|
| 1 | Add DB migration: `mfa_secret`, `mfa_verified` columns | S | — | Use existing migration tool |
| 2 | Implement TOTP generation + verification (`auth/totp.ts`) | M | — | Use `otpauth` library |
| 3 | Add MFA enrollment endpoint (`POST /auth/mfa/setup`) | M | 1, 2 | Returns QR code URL |
| 4 | Update login endpoint to return `mfa_required` flag | S | 1 | Backwards-compatible |
| 5 | Add MFA verify endpoint (`POST /auth/mfa/verify`) | M | 2, 4 | Sets session mfa_verified |
| 6 | Update auth middleware to check `mfa_verified` | S | 5 | Feature-flagged |
| 7 | Unit tests for TOTP logic | S | 2 | Time-sensitive: use fixed TOTP epoch |
| 8 | Integration tests for full MFA flow | M | 3, 5, 6 | — |

Size: S = < 4h, M = 4–16h, L = > 16h (L → break it down further)
```

**Rule:** If a task is L-sized, break it into smaller subtasks before proceeding.

---

## Phase 5 — Risk

**Goal:** Identify what could go wrong and decide in advance how to handle it.

```markdown
## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| TOTP clock skew causes verification failures | Medium | High | Allow ±1 time window tolerance |
| Users lock themselves out after enabling MFA | Medium | High | Add backup codes at enrollment |
| DB migration fails in production | Low | High | Test rollback script in staging first |
| Performance regression from additional auth DB queries | Low | Medium | Add index on `sessions.mfa_verified`; benchmark |
| Third-party `otpauth` library abandoned | Low | Low | Pin version; library is simple enough to vendor |
```

---

## When to Stop Planning

Stop planning and start implementing when:

- [ ] You can name every file you will create or change
- [ ] Every task is S or M sized
- [ ] Success criteria are measurable
- [ ] The riskiest assumption has been tested (spike if needed)
- [ ] The design has been shared with at least one other engineer

**Anti-patterns to avoid:**

- Planning for > 2 days on a feature that takes < 1 week to build
- Designing in a vacuum without reading the existing code
- Creating tasks larger than L (always decompose)
- Skipping the risk register for changes to critical paths (auth, payments, data migrations)

---

## Quick-Start Checklist

- [ ] Problem statement written in one paragraph
- [ ] Success criteria are measurable (not "it should be fast")
- [ ] Out-of-scope items explicitly listed
- [ ] Existing code explored before designing
- [ ] ADR written for irreversible decisions
- [ ] All tasks are S or M sized
- [ ] At least one mitigation per high-impact risk
- [ ] Plan reviewed by one other engineer before implementation begins
