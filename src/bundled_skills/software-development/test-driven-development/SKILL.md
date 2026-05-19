---
name: test-driven-development
description: TDD workflow — Red, Green, Refactor cycle with practical examples.
platforms: [linux, macos, windows]
tags: [tdd, testing, red-green-refactor, unit-tests, bdd, test-first, coverage]
---

# Test-Driven Development (TDD) SOP

Write a failing test, write just enough code to pass it, then refactor. Repeat. This SOP covers the full Red → Green → Refactor cycle with concrete examples.

## When to Use

- User wants to build a feature with test coverage from the start
- User wants to practice TDD on an existing or new function
- User is adding behavior to an existing module and wants to do it safely
- User is fixing a bug and wants to prevent regression

---

## The TDD Cycle

```
  ┌─────────────────────────────────────────────────────┐
  │                                                     │
  │   RED ──────→ GREEN ──────→ REFACTOR ──────→ RED   │
  │                                                     │
  │   Write a   Make it pass   Clean it up   Next test  │
  │   failing   with minimal   without        (repeat)   │
  │   test      code           breaking tests            │
  └─────────────────────────────────────────────────────┘
```

**Non-negotiable rules:**
1. Never write production code before a failing test
2. Write only enough production code to make the failing test pass
3. Never refactor on a red test — only refactor when all tests are green
4. Run tests after every change, no matter how small

---

## Step 1 — RED: Write a Failing Test

### Test Anatomy (Arrange → Act → Assert)

```python
def test_calculate_order_total_applies_discount():
    # Arrange — set up inputs
    items = [
        {"name": "Widget", "price": 10.00, "quantity": 3},
        {"name": "Gadget", "price": 25.00, "quantity": 1},
    ]
    discount_percent = 10

    # Act — call the code under test
    total = calculate_order_total(items, discount_percent)

    # Assert — verify the result
    assert total == 49.50  # (30 + 25) * 0.9
```

**Good test names describe behavior, not implementation:**
- `test_calculate_order_total_applies_discount` — good
- `test_total_function` — bad
- `test_with_10_percent_off_correctly_applies_the_discount_to_three_items` — too verbose

### Run It — Confirm It Fails

```bash
pytest tests/test_order.py::test_calculate_order_total_applies_discount -v
# Expected: FAILED (NameError or ImportError — function doesn't exist yet)
```

If the test passes immediately without writing production code, the test is wrong.

---

## Step 2 — GREEN: Minimal Implementation

Write the **simplest code that makes the test pass**. Do not add features beyond what the test requires.

```python
# order.py
def calculate_order_total(items, discount_percent=0):
    subtotal = sum(item["price"] * item["quantity"] for item in items)
    discount = subtotal * (discount_percent / 100)
    return round(subtotal - discount, 2)
```

```bash
pytest tests/test_order.py::test_calculate_order_total_applies_discount -v
# Expected: PASSED ✓
```

**Run the full test suite to ensure nothing regressed:**

```bash
pytest tests/ -v
# All existing tests must still pass
```

---

## Step 3 — REFACTOR: Clean Up

With green tests as a safety net, improve the code's structure without changing behavior.

```python
# After refactor — same behavior, cleaner implementation
def calculate_order_total(items: list[dict], discount_percent: float = 0) -> float:
    """Calculate order total with optional percentage discount applied."""
    if not 0 <= discount_percent <= 100:
        raise ValueError(f"discount_percent must be 0-100, got {discount_percent}")

    subtotal = sum(item["price"] * item["quantity"] for item in items)
    return round(subtotal * (1 - discount_percent / 100), 2)
```

```bash
pytest tests/ -v
# All tests still green after refactor
```

---

## Full TDD Walkthrough Example

Building a `PasswordValidator` class from scratch using TDD.

### Iteration 1 — Minimum length

```python
# tests/test_password_validator.py

from password_validator import PasswordValidator

def test_password_shorter_than_8_chars_is_invalid():
    validator = PasswordValidator()
    result = validator.validate("short")
    assert result.is_valid is False
    assert "at least 8 characters" in result.errors[0]
```

```bash
pytest -v  # RED: ImportError
```

```python
# password_validator.py — minimal implementation
from dataclasses import dataclass, field

@dataclass
class ValidationResult:
    is_valid: bool
    errors: list[str] = field(default_factory=list)

class PasswordValidator:
    def validate(self, password: str) -> ValidationResult:
        errors = []
        if len(password) < 8:
            errors.append("Password must be at least 8 characters")
        return ValidationResult(is_valid=len(errors) == 0, errors=errors)
```

```bash
pytest -v  # GREEN ✓
```

### Iteration 2 — Must contain uppercase

```python
def test_password_without_uppercase_is_invalid():
    validator = PasswordValidator()
    result = validator.validate("alllowercase1!")
    assert result.is_valid is False
    assert any("uppercase" in e for e in result.errors)

def test_valid_password_passes_all_checks():
    validator = PasswordValidator()
    result = validator.validate("SecurePass1!")
    assert result.is_valid is True
    assert result.errors == []
```

```bash
pytest -v  # RED: test_password_without_uppercase_is_invalid fails
```

```python
# Add to validate()
if not any(c.isupper() for c in password):
    errors.append("Password must contain at least one uppercase letter")
```

```bash
pytest -v  # GREEN ✓ — both new tests pass, existing tests still pass
```

### Iteration 3 — Refactor: extract validation rules

```python
# Refactor: rules become composable — behavior unchanged
class PasswordValidator:
    RULES = [
        (lambda p: len(p) >= 8,           "Password must be at least 8 characters"),
        (lambda p: any(c.isupper() for c in p), "Password must contain at least one uppercase letter"),
        (lambda p: any(c.isdigit() for c in p), "Password must contain at least one digit"),
        (lambda p: any(c in "!@#$%^&*" for c in p), "Password must contain at least one special character"),
    ]

    def validate(self, password: str) -> ValidationResult:
        errors = [msg for check, msg in self.RULES if not check(password)]
        return ValidationResult(is_valid=len(errors) == 0, errors=errors)
```

```bash
pytest -v  # GREEN ✓ — all tests pass, new rules covered by existing tests
```

---

## What to Test vs What to Mock

### Test directly:
- Pure functions (inputs → outputs, no side effects)
- Business logic and domain rules
- Data transformations and calculations
- Edge cases: empty input, max values, invalid types

### Mock (replace with a fake):
- External API calls (HTTP requests, Stripe, Twilio)
- Database queries
- File system I/O
- Clock / time (`datetime.now()`)
- Random number generation

```python
# Mocking an external API call
from unittest.mock import patch, MagicMock

def test_sends_welcome_email_after_registration():
    user = {"email": "alice@example.com", "name": "Alice"}

    with patch("services.email.send_email") as mock_send:
        mock_send.return_value = {"status": "sent"}
        result = register_user(user)

    assert result["success"] is True
    mock_send.assert_called_once_with(
        to="alice@example.com",
        subject="Welcome to our platform",
        template="welcome",
    )
```

---

## TDD for Different Test Types

### Unit Tests — single function or class

```python
# Fast, no external deps, pure logic
def test_format_currency_rounds_to_two_decimals():
    assert format_currency(1.2345) == "$1.23"
    assert format_currency(0)      == "$0.00"
    assert format_currency(-5.5)   == "-$5.50"
```

### Integration Tests — multiple real components

```python
# Slower, uses real DB/filesystem, tests component wiring
def test_user_registration_creates_db_record(test_db):
    register_user({"email": "alice@example.com", "name": "Alice"}, db=test_db)
    user = test_db.query("SELECT * FROM users WHERE email = ?", "alice@example.com")
    assert user is not None
    assert user["name"] == "Alice"
```

**Run unit and integration tests separately:**

```bash
pytest tests/unit/ -v           # fast, run on every save
pytest tests/integration/ -v    # slower, run before commit
```

---

## Running Tests Efficiently

```bash
# Run a single test
pytest tests/test_order.py::test_calculate_order_total_applies_discount -v

# Run all tests in a file
pytest tests/test_order.py -v

# Run tests matching a keyword
pytest -k "discount" -v

# Stop on first failure
pytest -x -v

# Show coverage report
pytest --cov=src --cov-report=term-missing tests/

# Watch mode (install pytest-watch)
ptw tests/ -- -v
```

---

## Common TDD Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Test passes without any production code | Test was already testing the wrong thing | Verify the test fails first, always |
| Too many things in one test | Hard to understand why it failed | One behavior per test |
| Testing implementation details | Test breaks on refactor even though behavior is correct | Test inputs/outputs, not internal method calls |
| Skipping the refactor step | Code gets messy over time | Refactor is not optional; budget time for it |
| Giant test setup | Every test has 50 lines of Arrange | Extract fixtures / factories |
| Mocking too much | Tests pass but production system is broken | Prefer integration tests for integration points |

---

## TDD Checklist (per feature)

- [ ] Wrote a failing test first (confirmed it is red)
- [ ] Implemented only enough code to pass the test (no speculative features)
- [ ] All tests green after implementation
- [ ] Refactored code — tests still green
- [ ] Edge cases covered: empty input, null, boundary values
- [ ] External dependencies mocked in unit tests
- [ ] Coverage report checked for untested branches
- [ ] Tests are readable by a teammate unfamiliar with this code
