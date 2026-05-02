---
name: api-design
description: RESTful API design principles, naming conventions, versioning, and error handling standards
---

# API Design SOP

## REST Resource Naming
```
# Use nouns (not verbs) for resources
GET    /users              → list users
POST   /users              → create user
GET    /users/:id          → get specific user
PUT    /users/:id          → replace user (full update)
PATCH  /users/:id          → partial update
DELETE /users/:id          → delete user

# Nested resources (when relationship is strong)
GET    /users/:id/orders   → orders belonging to user
POST   /users/:id/orders   → create order for user

# Actions that don't fit REST (use verb noun)
POST   /users/:id/activate
POST   /payments/:id/refund
POST   /reports/generate
```

## HTTP Status Codes — Use Them Correctly
```
200 OK              → Successful GET, PUT, PATCH
201 Created         → Successful POST (include Location header)
204 No Content      → Successful DELETE
400 Bad Request     → Invalid input, missing required field
401 Unauthorized    → Not authenticated (no token)
403 Forbidden       → Authenticated but not authorized
404 Not Found       → Resource doesn't exist
409 Conflict        → Duplicate, optimistic lock conflict
422 Unprocessable   → Validation errors (structured errors below)
429 Too Many Req.   → Rate limited (include Retry-After header)
500 Internal Error  → Server fault (never expose stack trace)
503 Unavailable     → Maintenance, overloaded
```

## Request & Response Conventions

### Success Response
```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 150
  }
}
```

### Error Response (RFC 7807 Problem Details)
```json
{
  "type": "https://api.example.com/errors/validation",
  "title": "Validation Failed",
  "status": 422,
  "detail": "The request body contains invalid data.",
  "errors": [
    { "field": "email", "message": "Invalid email format" },
    { "field": "age", "message": "Must be at least 18" }
  ],
  "trace_id": "abc-123"
}
```

## Versioning Strategy
```
# URL versioning (most visible, easiest for clients)
/api/v1/users
/api/v2/users

# Header versioning (cleaner URLs)
Accept: application/vnd.api+json; version=2

# Always:
# - Keep v1 alive for at least 6 months after v2 launch
# - Document breaking changes in CHANGELOG
# - Communicate deprecation schedule
```

## Authentication
```
# Use Bearer tokens in Authorization header
Authorization: Bearer eyJhbGc...

# Never in URL query params (shows in logs!)
❌ GET /api/users?token=secret

# Rate limit all endpoints
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1704067200
```

## Pagination
```
# Cursor-based (preferred for large datasets)
GET /posts?cursor=eyJpZCI6MTB9&limit=20
→ { data: [...], next_cursor: "eyJpZCI6MzB9" }

# Offset-based (simpler, fine for smaller datasets)
GET /posts?page=2&per_page=20
→ { data: [...], meta: { total: 100, page: 2 } }
```

## Filtering, Sorting, Field Selection
```
GET /users?status=active&role=admin       # Filtering
GET /posts?sort=-created_at,title         # Sort (- = desc)
GET /users?fields=id,email,name           # Sparse fieldsets
GET /users?search=john                    # Full-text search
```

## Agent Instructions
When designing or reviewing APIs:
1. Check existing endpoints in the codebase for consistency
2. Validate resource naming follows noun conventions
3. Ensure error responses follow the standard format
4. Confirm authentication is applied to all protected endpoints
5. Check that status codes match the documented conventions
6. Verify pagination is implemented for list endpoints
