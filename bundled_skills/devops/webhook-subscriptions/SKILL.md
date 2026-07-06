---
name: webhook-subscriptions
description: Design, implement, and debug webhook integrations with security and reliability.
platforms: [linux, macos, windows]
tags: [webhook, http, integration, security, hmac, idempotency, devops, api]
---

# Webhook Subscriptions SOP


## When to Use

- User wants to receive events from an external service (Stripe, GitHub, Shopify, Twilio, etc.)
- User wants to send webhooks from their own service to subscribers
- User is debugging why webhooks aren't being received or processed
- User wants to validate webhook security or handle retries

---

## Part 1 — Receiving Webhooks

### Minimal Express.js Handler

```typescript
import express from "express";
import crypto from "crypto";

const app = express();

// IMPORTANT: use raw body for signature validation, not parsed JSON
app.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    // 1. Validate signature first — reject early if invalid
    const signature = req.headers["stripe-signature"] as string;
    const isValid = validateStripeSignature(req.body, signature);

    if (!isValid) {
      console.warn("Invalid webhook signature", { signature });
      return res.status(400).json({ error: "Invalid signature" });
    }

    // 2. Parse the payload
    const event = JSON.parse(req.body.toString());

    // 3. Respond 200 immediately — do not wait for processing
    res.status(200).json({ received: true });

    // 4. Process asynchronously (after responding)
    await processEvent(event).catch((err) => {
      console.error("Webhook processing failed", { eventId: event.id, err });
    });
  }
);
```

### Why respond 200 immediately?
Most webhook providers retry on any non-2xx response or on timeout (typically 10–30 seconds). Long-running processing will cause unnecessary retries. Always acknowledge first, process after.

---

## Part 2 — Signature Validation (HMAC)

### Generic HMAC-SHA256 Validation

```typescript
function validateWebhookSignature(
  payload: Buffer,
  receivedSig: string,
  secret: string
): boolean {
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(receivedSig),
    Buffer.from(expectedSig)
  );
}
```

### Provider-Specific Signature Patterns

| Provider | Header | Format |
|----------|--------|--------|
| Stripe | `stripe-signature` | `t=timestamp,v1=signature` |
| GitHub | `x-hub-signature-256` | `sha256=<hex>` |
| Shopify | `x-shopify-hmac-sha256` | Base64 encoded |
| Twilio | `x-twilio-signature` | Base64 HMAC-SHA1 of URL + sorted params |
| Slack | `x-slack-signature` | `v0=<hex>`, includes timestamp |

### Stripe Signature Example

```typescript
function validateStripeSignature(
  payload: Buffer,
  sigHeader: string,
  secret: string = process.env.STRIPE_WEBHOOK_SECRET!
): boolean {
  const parts = sigHeader.split(",").reduce((acc, part) => {
    const [key, value] = part.split("=");
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  const timestamp = parts["t"];
  const receivedSig = parts["v1"];

  // Reject events older than 5 minutes (replay attack prevention)
  const tolerance = 300; // seconds
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > tolerance) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload.toString()}`;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(receivedSig),
    Buffer.from(expectedSig)
  );
}
```

---

## Part 3 — Idempotency

Webhook providers may deliver the same event more than once. Always handle duplicates.

### Strategy 1 — Event ID Deduplication (Redis)

```typescript
import { Redis } from "ioredis";
const redis = new Redis(process.env.REDIS_URL);

async function processEvent(event: WebhookEvent): Promise<void> {
  const lockKey = `webhook:processed:${event.id}`;
  const ttl = 60 * 60 * 24; // 24 hours

  // SET NX (only set if not exists) — atomic deduplication
  const acquired = await redis.set(lockKey, "1", "EX", ttl, "NX");
  if (!acquired) {
    console.log("Duplicate webhook, skipping", { eventId: event.id });
    return;
  }

  await handleEvent(event);
}
```

### Strategy 2 — Database Upsert

```sql
INSERT INTO webhook_events (id, type, payload, processed_at)
VALUES ($1, $2, $3, NOW())
ON CONFLICT (id) DO NOTHING;
-- Returns 0 rows affected if duplicate — check in application code
```

```typescript
const result = await db.query(
  `INSERT INTO webhook_events (id, type, payload, processed_at)
   VALUES ($1, $2, $3, NOW())
   ON CONFLICT (id) DO NOTHING`,
  [event.id, event.type, JSON.stringify(event)]
);

if (result.rowCount === 0) {
  return; // already processed
}
```

---

## Part 4 — Retry Handling

### Exponential Backoff (for sending webhooks)

```typescript
async function deliverWebhook(
  url: string,
  payload: object,
  attempt = 1
): Promise<void> {
  const maxAttempts = 5;
  const baseDelay = 1000; // 1 second

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Id": generateEventId(),
        "X-Webhook-Signature": signPayload(payload),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    if (attempt >= maxAttempts) {
      console.error("Webhook delivery failed after max attempts", { url, attempt });
      await saveFailedWebhook(url, payload, err); // dead-letter queue
      return;
    }

    // Exponential backoff with jitter
    const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
    console.warn(`Webhook attempt ${attempt} failed, retrying in ${delay}ms`);
    await sleep(delay);
    return deliverWebhook(url, payload, attempt + 1);
  }
}
```

### Retry Schedule Reference

| Attempt | Delay (typical) |
|---------|----------------|
| 1st retry | 5 seconds |
| 2nd retry | 30 seconds |
| 3rd retry | 5 minutes |
| 4th retry | 30 minutes |
| 5th retry | 2 hours |

---

## Part 5 — Local Testing

### Option A — ngrok

```bash
# Install ngrok, then:
ngrok http 3000

# Your local port 3000 is now accessible at:
# https://abc123.ngrok.io

# Use that URL in the Stripe / GitHub webhook settings
# ngrok dashboard: http://localhost:4040 — inspect all requests/responses
```

### Option B — smee.io (GitHub-native)

```bash
npm install --global smee-client
smee --url https://smee.io/your-channel-id --target http://localhost:3000/webhooks/github
```

### Option C — Webhook.site

1. Go to webhook.site — get a unique URL
2. Point the external service at that URL
3. Inspect the raw payload format (headers, body)
4. Copy the exact payload for local testing with curl:

```bash
curl -X POST http://localhost:3000/webhooks/stripe \
  -H "Content-Type: application/json" \
  -H "stripe-signature: t=1234567890,v1=your_test_sig" \
  -d @payload.json
```

---

## Part 6 — Error Response Codes

| Scenario | Response | Why |
|----------|----------|-----|
| Success | `200 OK` | Always — even if you'll process async |
| Invalid signature | `400 Bad Request` | Signals misconfiguration to sender |
| Unsupported event type | `200 OK` | Don't cause retries for events you ignore |
| Duplicate (already processed) | `200 OK` | Idempotent success |
| Your server error | `500 Internal Server Error` | Triggers provider retry |
| Rate limited (you're overloaded) | `429 Too Many Requests` + `Retry-After` header | Tells sender to back off |

---

## Part 7 — Outgoing Webhook Server Checklist

When building a service that sends webhooks to subscribers:

- [ ] Validate the subscriber URL is reachable before saving it
- [ ] Store the subscription with: URL, events list, secret, created_at, status
- [ ] Sign every outgoing payload with HMAC-SHA256 using a per-subscriber secret
- [ ] Include a unique event ID in headers (`X-Webhook-Id`)
- [ ] Implement retry with exponential backoff (max 5 attempts)
- [ ] Log all delivery attempts (status code, latency, attempt number)
- [ ] Disable subscriptions after N consecutive failures (e.g., 3 days of failures)
- [ ] Provide a UI for subscribers to view delivery logs and manually retry
- [ ] Implement a test delivery endpoint (`POST /webhooks/test`)

---

## Agent Instructions

1. When helping with incoming webhooks, always ask which provider (Stripe, GitHub, etc.) — each has a different signature scheme
2. Warn immediately if the user parses the body before signature validation — this invalidates the signature check
3. Always include idempotency handling — assume delivery-at-least-once
4. For local testing, recommend ngrok for quick sessions and smee for persistent dev setups
5. When writing webhook handlers, put the `200` response before async processing — it prevents retries
6. If a user's webhooks aren't arriving, check: URL accessibility, signature mismatch, SSL certificate, firewall rules, and request timeout
