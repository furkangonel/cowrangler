---
name: testing
description: Test writing SOP for unit, integration, and e2e tests with TDD approach
---

# Testing SOP

## Test Pyramid
```
        /\
       /e2e\       ← Few, slow, test full user journeys
      /──────\
     /integr. \    ← Some, test component interactions
    /──────────\
   /  unit tests \ ← Many, fast, test single units in isolation
  /──────────────\
```

## What to Test — Behavioral Coverage Checklist

For every function/module, think through:
- [ ] **Happy path**: normal inputs → expected output
- [ ] **Edge cases**: empty string, zero, null, undefined, empty array, max integer
- [ ] **Error cases**: invalid input, missing required field, network failure
- [ ] **Boundary values**: min/max allowed values, exact boundary, just over/under
- [ ] **Side effects**: does it correctly modify state, call dependencies?

## Test Structure — Arrange, Act, Assert
```typescript
describe("UserService.createUser", () => {
  it("should hash the password before saving", async () => {
    // ARRANGE
    const mockRepo = { save: jest.fn().mockResolvedValue({ id: "1" }) };
    const service = new UserService(mockRepo);
    const plainPassword = "secret123";

    // ACT
    await service.createUser({ email: "test@example.com", password: plainPassword });

    // ASSERT
    const savedUser = mockRepo.save.mock.calls[0][0];
    expect(savedUser.password).not.toBe(plainPassword);
    expect(savedUser.password).toMatch(/^\$2[aby]\$/); // bcrypt hash
  });

  it("should throw if email already exists", async () => {
    // ARRANGE
    const mockRepo = { save: jest.fn().mockRejectedValue(new DuplicateKeyError()) };
    const service = new UserService(mockRepo);

    // ACT & ASSERT
    await expect(
      service.createUser({ email: "existing@example.com", password: "pass" })
    ).rejects.toThrow("Email already in use");
  });
});
```

## Naming Tests
```
it("should <expected behavior> when <condition>")
it("should throw <error> if <invalid condition>")
it("should return <value> given <input>")
```

## Mocking Strategy
```typescript
// Mock external dependencies, not internal logic
jest.mock("../services/EmailService");        // External service
jest.mock("../repositories/UserRepository"); // Database layer

// Do NOT mock:
// - The unit under test itself
// - Simple utility functions
// - Pure functions with no side effects
```

## Test File Organization
```
src/
  users/
    user.service.ts
    user.service.test.ts  ← Unit tests live next to the file
tests/
  integration/
    user-api.test.ts      ← Integration tests in separate folder
  e2e/
    registration.test.ts  ← E2E tests
```

## Running and CI Integration
```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific file
npm test -- user.service.test.ts

# Watch mode during development
npm test -- --watch
```

## Coverage Goals
- Unit tests: aim for 80%+ line coverage of business logic
- Do NOT chase 100% — test behavior, not implementation details
- Always test: error handling branches, validation logic, data transformations

## Agent Instructions
1. Read the source file completely before writing tests
2. Check the project for existing test patterns (look at existing .test.ts files)
3. Match the existing test framework (jest, vitest, mocha, etc.)
4. Run tests with execute_bash after writing to confirm they pass
5. If a test is hard to write, it's a signal the code needs refactoring
6. Add tests for the specific bug being fixed (regression tests)
