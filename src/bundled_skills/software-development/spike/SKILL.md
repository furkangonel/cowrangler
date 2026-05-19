---
name: spike
description: Time-boxed technical investigation to reduce uncertainty before committing to an approach.
platforms: [linux, macos, windows]
tags: [spike, investigation, prototyping, technical-research, uncertainty, feasibility]
---

# Technical Spike SOP

A spike is a time-boxed investigation that answers a specific technical question. It produces a recommendation and confidence level — not production code.

## When to Use

- A key technical assumption has never been tested
- Two or more approaches look viable but their trade-offs are unclear
- A third-party library or API needs to be evaluated before committing to it
- Performance characteristics of an approach are unknown
- Team estimate variance for a task is high (disagreement signals hidden uncertainty)
- User says "I'm not sure if X is possible" or "I need to investigate Y"

---

## The Spike Process

```
1. QUESTION  →  2. TIME-BOX  →  3. INVESTIGATE  →  4. DOCUMENT  →  5. DECIDE
```

---

## Phase 1 — Frame the Question

A good spike question is:
- **Specific:** answerable with yes/no or a concrete recommendation
- **Bounded:** does not expand into full implementation
- **Actionable:** the answer changes what you build next

**Good spike questions:**
- "Can we use Postgres full-text search for our query patterns, or do we need Elasticsearch?"
- "Does the Stripe Connect API support split payments with our required fee model?"
- "Can the existing auth middleware handle WebSocket connections, or does it need changes?"
- "Will SQLite handle the concurrent write volume our gateway requires?"

**Bad spike questions (too vague):**
- "How should we build the payment system?" → This is planning, not a spike
- "Is React a good framework?" → Too broad, not actionable

**Fill in before starting:**

```markdown
## Spike: [Short descriptive title]

**Question to answer:** [Single specific question]
**Why this matters:** [What decision does the answer unlock?]
**Time box:** [1h / 2h / 4h / 8h — pick one]
**Definition of done:** [What output proves the question is answered?]
```

---

## Phase 2 — Time-Box Rules

| Investigation depth | Appropriate time box |
|--------------------|--------------------|
| Read docs + quick prototype | 1–2 hours |
| Build minimal proof-of-concept | 4 hours |
| Benchmark two approaches | 4–8 hours |
| Evaluate multiple vendors | 8 hours max |

**Rules:**
1. Set a timer at the start. When it expires, stop investigating and document what you have.
2. If the time box expires and you still cannot answer the question, that IS your answer: "insufficient data — recommend extending spike by N hours or choosing the safer default."
3. Never turn a spike into a production feature mid-investigation. Write it down and start over.
4. Spike code is throw-away. Do not merge it. Do not refactor it. Delete it after the spike.

---

## Phase 3 — Investigation Patterns

### Pattern A — Library / API Evaluation

```bash
# 1. Install in an isolated scratch project
mkdir spike-stripe-connect && cd spike-stripe-connect
npm init -y
npm install stripe

# 2. Write the minimum code that exercises the critical path
```

```javascript
// spike.js — does Stripe Connect support variable fee splits?
const Stripe = require('stripe')(process.env.STRIPE_TEST_KEY);

async function testSplitPayment() {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 10000,  // $100.00
      currency: 'usd',
      transfer_data: {
        amount: 9000,          // $90 to connected account
        destination: 'acct_TEST_CONNECTED',
      },
    });
    console.log('SUCCESS:', paymentIntent.id);
    console.log('Transfer amount:', paymentIntent.transfer_data.amount);
  } catch (err) {
    console.error('FAILED:', err.type, err.message);
  }
}

testSplitPayment();
```

```bash
# 3. Run and capture output
STRIPE_TEST_KEY=sk_test_xxx node spike.js 2>&1 | tee spike-output.txt
```

### Pattern B — Performance Benchmark

```python
# spike_benchmark.py — SQLite vs PostgreSQL concurrent write throughput
import sqlite3, time, threading, statistics

def sqlite_worker(db_path, n_writes, results, idx):
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.execute("CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, data TEXT)")
    start = time.time()
    for i in range(n_writes):
        conn.execute("INSERT INTO jobs (data) VALUES (?)", (f"job-{idx}-{i}",))
        conn.commit()
    results[idx] = time.time() - start
    conn.close()

N_THREADS = 10
N_WRITES  = 100
results   = [0.0] * N_THREADS
threads   = [threading.Thread(target=sqlite_worker,
                               args=("/tmp/spike.db", N_WRITES, results, i))
             for i in range(N_THREADS)]

for t in threads: t.start()
for t in threads: t.join()

total_writes = N_THREADS * N_WRITES
total_time   = max(results)
print(f"Concurrent writers : {N_THREADS}")
print(f"Total writes       : {total_writes}")
print(f"Wall time          : {total_time:.2f}s")
print(f"Throughput         : {total_writes / total_time:.0f} writes/sec")
print(f"Per-thread times   : min={min(results):.2f}s  max={max(results):.2f}s")
```

### Pattern C — Feasibility Check (API / Auth)

```bash
# Does the GitHub API support filtering pull requests by review state AND label?
curl -s \
  -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/owner/repo/pulls?state=open&labels=needs-review" \
  | python3 -c "
import sys, json
prs = json.load(sys.stdin)
if isinstance(prs, list):
    print(f'SUCCESS: {len(prs)} PRs returned')
    if prs:
        print('Sample labels:', [l[\"name\"] for l in prs[0].get(\"labels\", [])])
else:
    print('ERROR:', prs)
"
```

### Pattern D — Compatibility Check

```python
# Can our existing auth middleware handle WebSocket upgrades?
# Minimal repro that tests the specific integration point

from fastapi import FastAPI, WebSocket, Depends
from fastapi.testclient import TestClient
import asyncio

app = FastAPI()

async def get_current_user(token: str = None):  # simplified version of real middleware
    if token != "valid-token":
        raise HTTPException(status_code=401)
    return {"user_id": "123"}

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, user=Depends(get_current_user)):
    await ws.accept()
    await ws.send_text(f"hello {user['user_id']}")
    await ws.close()

# Test it
client = TestClient(app)
with client.websocket_connect("/ws?token=valid-token") as ws:
    data = ws.receive_text()
    assert data == "hello 123", f"Unexpected: {data}"
    print("PASS: Middleware works with WebSocket")

try:
    with client.websocket_connect("/ws?token=wrong") as ws:
        ws.receive_text()
    print("FAIL: Should have rejected invalid token")
except Exception as e:
    print(f"PASS: Invalid token correctly rejected ({type(e).__name__})")
```

---

## Phase 4 — Document Findings

Fill this out when the timer expires, regardless of how complete the investigation feels:

```markdown
## Spike Findings: [Title]

**Date:** 2026-05-18
**Time spent:** 3.5h (of 4h time box)
**Question asked:** Can we use Postgres FTS for our product search, or do we need Elasticsearch?

---

### What I Tested
1. Created a 100k-row products table with realistic data
2. Ran tsvector + GIN index queries with 3 realistic query patterns
3. Compared response times with and without the index
4. Tested phrase search and partial word matching

### Results

| Query pattern | With index | Without index | Acceptable? |
|---|---|---|---|
| Single keyword | 8ms | 2,400ms | Yes |
| Three keywords (AND) | 12ms | 3,100ms | Yes |
| Phrase match "organic cotton" | 45ms | 4,200ms | Yes |
| Partial word "organ*" | 180ms | 5,100ms | Marginal |

### What Worked
- GIN index makes keyword search fast enough for our current volume
- `ts_rank` produces reasonable relevance ordering
- Postgres FTS handles English stemming (searches "running" find "run")

### What Did Not Work / Limitations
- Partial/prefix search (`organ*`) is slow without trigram extension
- No synonym support built-in (would need a custom thesaurus)
- No typo tolerance (user types "produt" → no results)

### Recommendation
**Use Postgres FTS for v1.** Install `pg_trgm` extension for prefix search support.
Move to Elasticsearch only when we need: typo tolerance, synonyms, or > 10M records.

### Confidence Level
High — tested against realistic data volume and query patterns.

### Follow-up Tasks
- [ ] Add `pg_trgm` extension to migration
- [ ] Write a failing test for prefix search before implementing it
- [ ] Set a threshold: re-evaluate at 5M product records
```

---

## Phase 5 — Decide and Discard

After documenting:

1. **Share findings** with the team (Slack, PR comment, or standup — pick one)
2. **Capture the decision** in an ADR if it affects architecture
3. **Delete spike code** — it is not production quality and must not be reused
4. **Create implementation tickets** based on the recommendation

---

## Checklist

- [ ] Spike question is specific and answerable (not a planning question)
- [ ] Time box set before starting
- [ ] Spike code written in an isolated scratch project
- [ ] Timer stopped investigation — findings documented even if incomplete
- [ ] Findings template filled in: what was tested, results, recommendation, confidence level
- [ ] Spike code deleted after findings documented
- [ ] Follow-up tasks created as proper tickets
