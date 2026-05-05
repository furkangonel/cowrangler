---
name: simplify
description: Audit recently changed code for reuse, quality, and efficiency issues using parallel sub-agents, then fix all findings
when_to_use: Use after making code changes when the user wants a quality pass. Triggers include "simplify", "kodu sadeleştir", "temizle", "refactor et", "gereksiz kodu kaldır", "daha iyi yaz", "kalite kontrolü yap", "kodu optimize et", "dead code var mı", "DRY prensibi", "clean up the changes". Also trigger automatically when the user says "done, review the changes" or "let's clean this up" after a coding session.
argument-hint: "[optional: specific files or areas to focus on]"
---

# Simplify Skill

## Goal
Run a focused quality audit on the code changed in the current session (or specified files), identify reuse/quality/efficiency issues, then fix them — all without changing external behavior.

## Philosophy
- **Behavior is sacred**: Never change what the code does, only how it does it
- **Prefer deletion**: The best code is code you don't have to maintain
- **Three lenses**: Code Reuse (DRY), Code Quality (readability, correctness), Efficiency (performance, bundle size)

## Steps

### 1. Identify changed code
Run `git diff --name-only HEAD` (or the specified files) to get the scope.

If no git changes and no files specified, ask the user which files to audit.

**Success criteria**: You have a clear list of files/functions to audit.

### 2. Launch parallel audit agents
Use `spawn_subagent_parallel` with three agents running simultaneously:

**Agent 1 — Code Reuse (explore)**
Task: Find duplication in the changed files. Look for:
- Functions/logic duplicated elsewhere in the codebase
- Inline code that should be extracted into utilities
- Repeated patterns that could use existing libraries
- Constants that are hardcoded instead of referenced

**Agent 2 — Code Quality (code-reviewer)**
Task: Identify quality issues in the changed files. Look for:
- Unclear variable/function names
- Missing or incorrect error handling
- Functions doing too many things (SRP violations)
- Commented-out code or dead branches
- Type safety issues (any, implicit any, missing return types)

**Agent 3 — Efficiency (performance)**
Task: Find performance and efficiency issues in the changed files. Look for:
- Unnecessary re-computation inside loops
- Missing memoization for expensive operations
- Synchronous blocking where async would work
- Large imports when only small parts are used
- Memory leaks (event listeners, timers, subscriptions not cleaned up)

**Success criteria**: All three agents complete and return findings.

### 3. Triage findings
Collect all findings from the three agents. Categorize each as:
- **Fix now** — clear improvement, zero risk of behavior change
- **Discuss** — might be improvement but has trade-offs (share with user)
- **Skip** — out of scope or not worth the churn

Show the **Discuss** items to the user before touching them.

**Success criteria**: User is aware of any non-obvious changes before they're made.

### 4. Apply fixes
For each "Fix now" item, apply the change using `edit_file`. After all edits:
- Run any available lint/type-check: `tsc --noEmit`, `eslint`, `ruff`, etc.
- If tests exist, run them: `npm test`, `pytest`, etc.

**Success criteria**: All checks pass, no behavior change.

### 5. Report
Summarize what was changed and why, grouped by the three audit lenses. Include before/after snippets for the most significant changes.

Use `send_message` to present the summary.
