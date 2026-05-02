---
name: debugging
description: Systematic bug investigation process — reproduce, isolate, root cause, fix, verify
---

# Debugging SOP

## The Scientific Method for Bugs

### Step 1 — Understand the Symptom
- Read the error message / stack trace carefully (every line)
- Identify: What was expected? What actually happened?
- Note: When does it occur? Always, or only sometimes?
- Check: Is this a regression? When did it last work?

### Step 2 — Reproduce the Bug
```bash
# Can you reproduce it reliably?
# If not, it may be:
# - Race condition (timing-dependent)
# - Environment-specific (env vars, OS, versions)
# - Data-dependent (specific inputs trigger it)
```

- Reduce to the minimal reproduction case
- Confirm the reproduction before investigating
- Check if it reproduces in a fresh environment

### Step 3 — Read the Code
- Locate the exact file and function from the stack trace
- Trace the execution path from input → failure point
- Look at what changed recently: `git log --since="3 days ago" -- <file>`

### Step 4 — Form a Hypothesis
State your hypothesis explicitly:
> "I think the bug is caused by X because Y"

Then check what evidence would confirm or disprove it.

### Step 5 — Verify the Hypothesis
Add targeted logging to confirm:
```typescript
console.log("[DEBUG]", { variableName, type: typeof variableName });
```
Or use the debugger:
```bash
node --inspect-brk dist/main.js  # Attach Chrome DevTools
```

### Step 6 — Fix
- Make the minimal change that fixes the root cause
- Do NOT fix symptoms — fix root causes
- Do NOT refactor while fixing (separate concerns)

### Step 7 — Verify the Fix
```bash
# Run existing tests
npm test

# Confirm the original reproduction no longer fails
# Add a regression test to prevent recurrence
```

## Common Bug Patterns

### Async/Await Issues
```typescript
// WRONG — Promise not awaited
const data = fetchData();  // returns Promise, not data
console.log(data.name);    // undefined!

// CORRECT
const data = await fetchData();
```

### Off-by-One
- Array indices: `arr[arr.length]` is undefined, `arr[arr.length - 1]` is last
- Loop boundaries: `< length` vs `<= length`

### Mutation vs Copy
```typescript
// WRONG — mutates original
const sorted = arr.sort();

// CORRECT — copy first
const sorted = [...arr].sort();
```

### Environment Variables
```typescript
// Always validate env vars at startup
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}
```

## Agent Instructions
1. Always read the error message before looking at code
2. Use `git_log` to find recent changes that might be related
3. Use `search_in_files` to find all usages of the problematic function
4. Use `execute_bash` to run tests and confirm reproduction
5. Explain your reasoning at each step — debugging is a communication exercise
6. After fixing, always run the test suite and check for regressions
