---
name: refactoring
description: Safe, incremental refactoring techniques — improve structure without changing behavior
---

# Refactoring SOP

## Golden Rule
**Refactoring must not change observable behavior.**
Tests must pass before AND after every refactoring step.

## Pre-Refactoring Checklist
- [ ] Tests exist for the code being refactored (write them first if not)
- [ ] The current behavior is clearly understood
- [ ] A clear goal for the refactoring is defined
- [ ] Changes are isolated to one concern at a time

## Refactoring Catalog

### Extract Function
When: A block of code does one identifiable thing; the block is too long; code is duplicated.
```typescript
// BEFORE
function printReport(data: ReportData) {
  // ... 20 lines of calculation ...
  const total = data.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const tax = total * 0.18;
  // ... 20 lines of formatting ...
}

// AFTER
function calculateTotal(items: Item[]) {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
}
function calculateTax(total: number, rate = 0.18) {
  return total * rate;
}
```

### Replace Magic Numbers with Named Constants
```typescript
// BEFORE
if (user.sessionAge > 86400) { logout(); }

// AFTER
const SESSION_EXPIRY_SECONDS = 86400; // 24 hours
if (user.sessionAge > SESSION_EXPIRY_SECONDS) { logout(); }
```

### Simplify Conditionals — Early Return / Guard Clauses
```typescript
// BEFORE (arrow-shaped code)
function processOrder(order: Order) {
  if (order) {
    if (order.items.length > 0) {
      if (order.status === "pending") {
        // actual logic...
      }
    }
  }
}

// AFTER (flat, readable)
function processOrder(order: Order) {
  if (!order) return;
  if (order.items.length === 0) return;
  if (order.status !== "pending") return;
  // actual logic...
}
```

### Remove Duplication (DRY)
```typescript
// BEFORE
function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validateLoginEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);  // duplicated!
}

// AFTER
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email: string) {
  return EMAIL_REGEX.test(email);
}
```

### Rename for Clarity
```typescript
// BEFORE
const d = new Date();
const u = users.filter(x => x.a);

// AFTER
const currentDate = new Date();
const activeUsers = users.filter(user => user.isActive);
```

### Extract Class / Module
When: A class has too many responsibilities; group of related functions could form a cohesive module.

## Refactoring Process
```
1. Run tests → all green ✓
2. Make ONE small refactoring change
3. Run tests → all green ✓
4. Commit: "refactor: extract calculateTax function"
5. Repeat
```

Never make more than one refactoring at a time between test runs.

## What NOT to Do During Refactoring
- Do not fix bugs (create a separate commit)
- Do not add new features (separate branch)
- Do not optimize prematurely (measure first)
- Do not change public APIs without a deprecation plan

## Agent Instructions
1. Read the target file thoroughly before planning changes
2. Run existing tests first to confirm baseline
3. Make changes incrementally — one refactoring at a time
4. Run tests after EACH change with execute_bash
5. Write descriptive commit messages for each step
6. If tests don't exist, write them before refactoring
