---
name: systematic-debugging
description: Methodical bug investigation and root cause analysis.
platforms: [linux, macos, windows]
tags: [debugging, bug-fixing, root-cause, investigation, troubleshooting, production-issues]
---

# Systematic Debugging SOP

A methodical process for diagnosing bugs, production incidents, and unexpected behavior — without random guessing.

## When to Use

- User has a bug with unexpected behavior to diagnose
- User has a production incident or error to investigate
- User has a test that is failing for an unclear reason
- User is spending more than 15 minutes on a bug without a clear hypothesis
- User says "I have no idea why this is happening"

---

## The Debugging Process

```
1. REPRODUCE  →  2. ISOLATE  →  3. HYPOTHESIZE  →  4. TEST  →  5. FIX  →  6. VERIFY
```

Never skip to step 5. Fixing a symptom without a root cause always creates more bugs.

---

## Phase 1 — Reproduce

**Goal:** Produce the bug on demand, reliably.

Questions to answer:
1. Can you make it happen every time, or is it intermittent?
2. What are the exact steps to trigger it?
3. What did you expect to happen? What actually happened?
4. When did it start happening? What changed around that time?
5. Does it happen in all environments, or only production/staging/local?

**Reproduce checklist:**
- [ ] Run the failing code and capture the exact error message and stack trace
- [ ] Note the exact input that triggers the bug
- [ ] Confirm it was working before (check git log, recent deployments)
- [ ] Test in the same environment where the bug appears

```bash
# Capture full error output
python app.py 2>&1 | tee bug_repro.log

# Reproduce with exact same inputs
curl -v -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"item_id": 42, "quantity": 0}' \
  2>&1 | tee repro.log
```

**If intermittent:** Add logging before the suspected failure point and wait for it to happen again. Do not proceed without a reliable reproduction path.

---

## Phase 2 — Isolate

**Goal:** Narrow the failing code to the smallest possible unit.

### Binary Search Debugging

Cut the problem space in half with each step:

```
Full system fails
  → Does the API layer fail? (yes)
    → Does it fail with all requests? (no, only POST /orders)
      → Does it fail for all users? (no, only when quantity = 0)
        → ROOT: input validation doesn't reject zero quantity
```

### Minimal Reproducing Example

Reduce the failing code to the smallest self-contained snippet that still shows the bug:

```python
# Original failing code (200 lines, many dependencies)
result = process_order(customer_id, items, coupon_code, shipping_address, payment_method)

# Minimal reproduction — does this function alone fail?
from order_processor import calculate_discount
result = calculate_discount(price=100, coupon="SAVE10", quantity=0)
# → ZeroDivisionError: float division by zero
# Found it: calculate_discount divides by quantity
```

### Isolation Techniques

```bash
# Git bisect — find the commit that introduced the bug
git bisect start
git bisect bad HEAD          # current commit is broken
git bisect good v1.2.3       # this version was working
# Git checks out commits; run your repro script each time
# git bisect good / git bisect bad until it finds the culprit
git bisect run python test_repro.py   # automate the bisect
```

```python
# Comment out code to isolate the failing path
def process_order(order):
    validate_items(order.items)         # <-- is this failing?
    # apply_discount(order)             # commented out temporarily
    # calculate_shipping(order)         # commented out temporarily
    return create_invoice(order)
```

---

## Phase 3 — Hypothesize

**Goal:** Form a specific, testable theory about the root cause.

A good hypothesis:
- States exactly what is wrong and why
- Is falsifiable (you can prove it wrong)
- Points to a specific location in code

**Good hypothesis:**
> "The `calculate_discount` function divides by `quantity` without checking for zero first. When `quantity=0` is passed from the order validation layer (which currently allows it), we get a ZeroDivisionError."

**Bad hypothesis:**
> "Something is wrong with the order processing."

### Hypothesis Template

```markdown
## Hypothesis
**What is happening:** [specific technical description]
**Why it is happening:** [root cause]
**Location:** [file, function, line number]
**Evidence:** [what I observed that supports this]
**Test:** [what I will do to confirm or refute this]
```

---

## Phase 4 — Test the Hypothesis

**Goal:** Prove or disprove your hypothesis without changing production code.

### Add Targeted Logging

```python
# Before the suspected failure point — log state
import logging
logger = logging.getLogger(__name__)

def calculate_discount(price, coupon, quantity):
    logger.debug(f"calculate_discount called: price={price}, coupon={coupon}, quantity={quantity}")
    if coupon:
        discount_rate = get_discount_rate(coupon)
        logger.debug(f"discount_rate={discount_rate}")
        per_item_discount = discount_rate / quantity   # <-- suspected line
        # ...
```

### Use a Debugger

```python
# Python — breakpoint() (Python 3.7+)
def calculate_discount(price, coupon, quantity):
    breakpoint()   # drops into pdb at this line
    per_item_discount = discount_rate / quantity
```

```bash
# pdb commands
n   # next line
s   # step into function
c   # continue to next breakpoint
p variable_name  # print variable
pp dict_or_object  # pretty print
l   # list surrounding code
q   # quit
```

```javascript
// JavaScript — debugger statement
function calculateDiscount(price, coupon, quantity) {
  debugger;  // pause here in browser DevTools or Node inspector
  const perItemDiscount = discountRate / quantity;
}
```

```bash
# Node.js inspector
node --inspect-brk app.js
# Open chrome://inspect in Chrome
```

### Reproduce in a Unit Test

```python
def test_calculate_discount_with_zero_quantity():
    # Reproduces the exact bug condition
    with pytest.raises(ZeroDivisionError):
        calculate_discount(price=100, coupon="SAVE10", quantity=0)

# Run it to confirm the hypothesis
pytest test_repro.py::test_calculate_discount_with_zero_quantity -v
# PASSED (bug confirmed — the test catches the error)
```

---

## Phase 5 — Fix

**Goal:** Fix the root cause, not the symptom.

### Symptom Fix vs Root Cause Fix

```python
# SYMPTOM FIX — suppresses the error, hides the problem
def calculate_discount(price, coupon, quantity):
    try:
        per_item_discount = discount_rate / quantity
    except ZeroDivisionError:
        per_item_discount = 0  # silently ignores bad input

# ROOT CAUSE FIX — reject invalid input at the boundary
def validate_order(order):
    if order.quantity <= 0:
        raise ValueError(f"quantity must be a positive integer, got {order.quantity}")

def calculate_discount(price, coupon, quantity):
    # quantity is now guaranteed to be > 0 by the time we get here
    per_item_discount = discount_rate / quantity
```

**Root cause principle:** Fix the bug at the point where invalid state first enters the system, not where it eventually causes a crash.

---

## Phase 6 — Verify

**Goal:** Confirm the fix works and has not broken anything else.

1. **Run the failing reproduction** — it must now pass
2. **Run the full test suite** — nothing else must break
3. **Write a regression test** — so this bug cannot silently return

```python
# Regression test — named after the bug ticket
def test_order_with_zero_quantity_returns_validation_error():
    """Regression: #BUG-342 — zero quantity caused ZeroDivisionError in discount calc."""
    with pytest.raises(ValueError, match="quantity must be a positive integer"):
        create_order(item_id=42, quantity=0)
```

```bash
# Full verification sequence
pytest tests/                    # all tests
pytest -k "discount or order"    # related tests specifically
git diff                         # review what changed
```

---

## Quick Reference — Reading Stack Traces

```
Traceback (most recent call last):        ← start reading from BOTTOM
  File "api/routes.py", line 45, in handle_order
    result = process_order(order)         ← call chain (2nd from bottom = your code)
  File "services/order.py", line 122, in process_order
    discount = calculate_discount(price, coupon, quantity)
  File "services/discount.py", line 18, in calculate_discount
    per_item_discount = discount_rate / quantity   ← ACTUAL FAILURE LINE
ZeroDivisionError: float division by zero          ← error type and message
```

**Rule:** The bottom of the stack trace is where the error occurred. Work upward to find the first line in YOUR code (not a library).

---

## Debugging Specific Scenarios

### Intermittent / Race Condition

```python
import threading, logging

# Add thread ID to every log message
logging.basicConfig(format='%(asctime)s [%(thread)d] %(message)s')

# Add locks to suspect shared state
lock = threading.Lock()
with lock:
    # critical section
    shared_counter += 1
```

### Production-Only Bug

```bash
# Compare production vs local configuration
diff <(ssh prod 'env | sort') <(env | sort) | grep "^[<>]"

# Check if it's a data issue (works locally because local DB lacks edge case data)
# Dump a sample of production data and test locally
pg_dump -t orders --where="status='failed'" prod_db | psql local_db
```

### Performance Bug (slow query / slow endpoint)

```python
import time, functools

def timed(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = fn(*args, **kwargs)
        elapsed = time.perf_counter() - start
        print(f"{fn.__name__} took {elapsed*1000:.1f}ms")
        return result
    return wrapper

@timed
def slow_function():
    ...
```

```bash
# SQL: EXPLAIN the slow query
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42 AND status = 'pending';
# Look for: Seq Scan (bad for large tables), high actual rows vs estimated rows
```

---

## Post-Fix Checklist

- [ ] Reproduction steps confirmed fixed
- [ ] Full test suite passes
- [ ] Regression test written (so this exact bug cannot silently return)
- [ ] Root cause identified and fixed (not just the symptom)
- [ ] Related code reviewed for the same pattern
- [ ] Debugging code (breakpoints, extra logging) removed before committing
- [ ] Brief root cause note added to the fix commit message:
  ```
  fix: prevent ZeroDivisionError when order quantity is zero
  
  Root cause: calculate_discount() divided by quantity without validating it
  was non-zero. Added quantity > 0 validation in validate_order() where
  untrusted input first enters the system.
  
  Fixes #342
  ```
