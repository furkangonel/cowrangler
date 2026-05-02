---
name: code-review
description: Systematic code review SOP covering correctness, security, performance, and maintainability
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
