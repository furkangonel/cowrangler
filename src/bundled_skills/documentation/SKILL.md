---
name: documentation
description: Code documentation SOP — JSDoc, inline comments, README, and API docs standards
---

# Documentation SOP

## Principle: Document WHY, not WHAT
Good comments explain intent, context, and constraints — not what the code obviously does.
```typescript
// BAD: restates the code
// increment counter by 1
counter++;

// GOOD: explains non-obvious reason
// Rate limiter uses a sliding window; we increment here to count
// the request before the limit check so abusive callers always
// consume their quota even if the request is rejected.
counter++;
```

## JSDoc / TSDoc Standards

### Functions
```typescript
/**
 * Calculates the user's subscription renewal date based on their billing cycle.
 *
 * @param user - The user whose renewal date to calculate
 * @param referenceDate - The date to calculate from (defaults to now; override in tests)
 * @returns ISO 8601 date string of the next renewal, or null if subscription is cancelled
 * @throws {SubscriptionError} If the user has no active subscription
 *
 * @example
 * const renewalDate = getRenewalDate(user);
 * // → "2025-03-15T00:00:00.000Z"
 */
function getRenewalDate(user: User, referenceDate = new Date()): string | null {
  ...
}
```

### Classes
```typescript
/**
 * Manages the connection pool for the primary database.
 *
 * Implements exponential backoff on connection failures and
 * automatically reconnects after network interruptions.
 * Not intended for use with read replicas — use ReadReplicaPool for those.
 */
class DatabasePool {
  ...
}
```

### Interfaces / Types
```typescript
/** Represents a processed payment from the Stripe gateway. */
interface StripePayment {
  /** Stripe payment intent ID (pi_...) */
  intentId: string;
  /** Amount in the smallest currency unit (cents for USD) */
  amountCents: number;
  /** ISO 4217 currency code */
  currency: string;
  /** Unix timestamp of when Stripe confirmed the charge */
  confirmedAt: number;
}
```

## When to Write Inline Comments
Write a comment when:
- A workaround for a third-party library bug is in place (link to the issue)
- Business logic is non-obvious (`// Freelancers in DE are taxed differently per §19 UStG`)
- A performance optimization would look like an anti-pattern without explanation
- A "why not" explains an approach that was tried and abandoned

## README Structure
```markdown
# Project Name

One-line description of what this does and who it's for.

## Quick Start
\`\`\`bash
npm install
cp .env.example .env  # fill in required values
npm run dev
\`\`\`

## Requirements
- Node.js 20+
- PostgreSQL 15+

## Configuration
| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| REDIS_URL | No | Cache backend (optional) |

## Development
\`\`\`bash
npm run dev     # Start development server
npm test        # Run tests
npm run build   # Production build
\`\`\`

## Architecture
Brief description of key design decisions and folder structure.

## Contributing
See CONTRIBUTING.md

## License
MIT
```

## CHANGELOG Format (Keep a Changelog)
```markdown
## [1.2.0] - 2025-01-15
### Added
- User avatar upload support (PNG, JPG up to 5MB)
### Fixed
- Race condition in session renewal that caused rare logouts
### Changed
- Password minimum length increased from 8 to 12 characters
### Deprecated
- /api/v1/profile endpoint — use /api/v2/users/:id instead
### Removed
- Legacy XML response format (deprecated in 1.0.0)
```

## Agent Instructions
1. Read the existing documentation style before adding new docs
2. Only document public APIs — internal helpers can have minimal comments
3. Run `search_in_files` to find similar functions and match their doc style
4. Update the README if a new feature changes the public interface
5. Keep examples in JSDoc comments runnable and correct
6. Never document the obvious — every comment should earn its place
