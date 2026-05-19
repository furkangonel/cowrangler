---
name: airtable
description: Airtable base management — records, views, and formulas via REST API.
platforms: [linux, macos, windows]
tags: [airtable, api, database, records, automation, rest, no-code]
---

# Airtable REST API SOP

Read, create, update, and delete Airtable records. Covers auth, filtering, pagination, batch operations, and field type reference.

## When to Use

- User wants to read records from an Airtable base
- User wants to create or update Airtable records
- User wants to filter or sort records by field values
- User wants to automate data entry or sync into Airtable
- User wants to delete or patch records in bulk

---

## Part 1 — Auth Setup

### 1. Get a Personal Access Token

1. Go to [https://airtable.com/create/tokens](https://airtable.com/create/tokens)
2. Click **Create new token**
3. Name it, add scopes: `data.records:read`, `data.records:write`, `schema.bases:read`
4. Add bases or grant access to all bases
5. Copy the token (shown only once)

```bash
export AIRTABLE_TOKEN="patXXXXXXXXXXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
```

Or store in `~/.cowrangler/credentials.env`:
```
AIRTABLE_TOKEN=patXXXXXXXXXXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### 2. Find Your Base and Table IDs

**Base ID** is in the URL: `https://airtable.com/appXXXXXXXXXXXXXX/...` → `appXXXXXXXXXXXXXX`

**Table ID or name** — use the table name directly in the URL (URL-encoded) or get the ID from the metadata API:

```bash
AIRTABLE_TOKEN="${AIRTABLE_TOKEN:-$(grep '^AIRTABLE_TOKEN=' ~/.cowrangler/credentials.env 2>/dev/null | cut -d= -f2 | tr -d '\n\r')}"
BASE_ID="appXXXXXXXXXXXXXX"

# List all tables in a base
curl -s "https://api.airtable.com/v0/meta/bases/$BASE_ID/tables" \
  -H "Authorization: Bearer $AIRTABLE_TOKEN" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
for t in data['tables']:
    print(f\"{t['id']}  {t['name']}\")
"
```

### Shell Helper

```bash
airtable_get() {
  # Usage: airtable_get "appXXX/TableName?filterByFormula=..."
  curl -s "https://api.airtable.com/v0/$1" \
    -H "Authorization: Bearer $AIRTABLE_TOKEN"
}

airtable_post() {
  # Usage: airtable_post "appXXX/TableName" '{"records":[...]}'
  curl -s -X POST "https://api.airtable.com/v0/$1" \
    -H "Authorization: Bearer $AIRTABLE_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$2"
}

airtable_patch() {
  # Usage: airtable_patch "appXXX/TableName" '{"records":[...]}'
  curl -s -X PATCH "https://api.airtable.com/v0/$1" \
    -H "Authorization: Bearer $AIRTABLE_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$2"
}
```

---

## Part 2 — Reading Records

### List Records (basic)

```python
import os, json, urllib.request, urllib.parse

TOKEN   = os.environ["AIRTABLE_TOKEN"]
BASE_ID = "appXXXXXXXXXXXXXX"
TABLE   = "Tasks"  # table name or ID

def airtable_request(method, path, body=None):
    url = f"https://api.airtable.com/v0/{BASE_ID}/{urllib.parse.quote(path)}"
    headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as r:
        return json.load(r)

result = airtable_request("GET", TABLE)
for rec in result["records"]:
    print(rec["id"], rec["fields"])
```

### Filter Records with Formula

```python
import urllib.parse

# Airtable formula syntax (similar to Excel)
formula = "{Status} = 'In Progress'"

params = urllib.parse.urlencode({
    "filterByFormula": formula,
    "fields[]": ["Name", "Status", "Due Date", "Assignee"],  # only these fields
    "sort[0][field]": "Due Date",
    "sort[0][direction]": "asc",
    "maxRecords": 100,
})

url = f"https://api.airtable.com/v0/{BASE_ID}/{urllib.parse.quote(TABLE)}?{params}"
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"})
with urllib.request.urlopen(req) as r:
    result = json.load(r)

for rec in result["records"]:
    f = rec["fields"]
    print(f"{rec['id']}  {f.get('Name', ''):30s}  {f.get('Status', ''):15s}  {f.get('Due Date', '')}")
```

### Common Formula Examples

```
# Filter by single-line text
{Name} = 'Alice'

# Filter by checkbox
{Done} = TRUE()

# Filter by date (before today)
IS_BEFORE({Due Date}, TODAY())

# Filter records where a field is not empty
{Assignee} != ''

# Multiple conditions
AND({Status} = 'In Progress', {Priority} = 'High')

# OR condition
OR({Status} = 'To Do', {Status} = 'In Progress')

# Search in text
FIND('keyword', {Description}) > 0
```

### Paginate Through All Records

```python
def list_all_records(table, formula=None, fields=None):
    records = []
    offset = None

    while True:
        params = {"pageSize": 100}
        if formula:
            params["filterByFormula"] = formula
        if fields:
            for i, f in enumerate(fields):
                params[f"fields[{i}]"] = f
        if offset:
            params["offset"] = offset

        query = urllib.parse.urlencode(params)
        url = f"https://api.airtable.com/v0/{BASE_ID}/{urllib.parse.quote(table)}?{query}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}"})
        with urllib.request.urlopen(req) as r:
            data = json.load(r)

        records.extend(data["records"])
        offset = data.get("offset")
        if not offset:
            break

    return records

all_tasks = list_all_records("Tasks", formula="{Status} != 'Done'")
print(f"Total active tasks: {len(all_tasks)}")
```

---

## Part 3 — Creating Records

### Create a Single Record

```python
result = airtable_request("POST", TABLE, {
    "records": [
        {
            "fields": {
                "Name": "Set up monitoring dashboard",
                "Status": "To Do",
                "Priority": "High",
                "Due Date": "2026-06-01",
                "Notes": "Use Grafana. See ticket #342.",
            }
        }
    ]
})
created = result["records"][0]
print(f"Created: {created['id']}  {created['fields']['Name']}")
```

### Batch Create Records (up to 10 per request)

```python
items = [
    {"Name": "Write unit tests",       "Status": "To Do", "Priority": "High"},
    {"Name": "Update documentation",   "Status": "To Do", "Priority": "Medium"},
    {"Name": "Deploy to staging",      "Status": "To Do", "Priority": "High"},
    {"Name": "Review pull requests",   "Status": "In Progress", "Priority": "Medium"},
]

# Airtable accepts max 10 records per request
BATCH_SIZE = 10
for i in range(0, len(items), BATCH_SIZE):
    batch = items[i:i + BATCH_SIZE]
    result = airtable_request("POST", TABLE, {
        "records": [{"fields": f} for f in batch]
    })
    for rec in result["records"]:
        print(f"  Created {rec['id']}: {rec['fields']['Name']}")
```

---

## Part 4 — Updating Records

### Update a Single Record (PATCH — only specified fields)

```python
RECORD_ID = "recXXXXXXXXXXXXXX"

result = airtable_request("PATCH", TABLE, {
    "records": [
        {
            "id": RECORD_ID,
            "fields": {
                "Status": "Done",
                "Completed Date": "2026-05-18",
            }
        }
    ]
})
```

### Batch Update Records (up to 10)

```python
updates = [
    {"id": "recAAAAAAAAAAAAAAAA", "fields": {"Status": "Done"}},
    {"id": "recBBBBBBBBBBBBBBBB", "fields": {"Status": "In Progress", "Assignee": ["recUSER1"]}},
]

for i in range(0, len(updates), 10):
    batch = updates[i:i + 10]
    airtable_request("PATCH", TABLE, {"records": batch})
```

### Upsert Records (create or update based on a key field)

```python
# Available in Airtable API with performUpsert
result = airtable_request("PATCH", TABLE, {
    "performUpsert": {"fieldsToMergeOn": ["Email"]},
    "records": [
        {"fields": {"Email": "alice@example.com", "Name": "Alice", "Status": "Active"}},
        {"fields": {"Email": "bob@example.com",   "Name": "Bob",   "Status": "Inactive"}},
    ]
})
print(f"Created: {len(result['createdRecords'])}  Updated: {len(result['updatedRecords'])}")
```

---

## Part 5 — Deleting Records

```python
import urllib.parse

# Delete up to 10 records per request
record_ids = ["recAAAAAAAAAAAAAAAA", "recBBBBBBBBBBBBBBBB"]
params = "&".join(f"records[]={rid}" for rid in record_ids)

url = f"https://api.airtable.com/v0/{BASE_ID}/{urllib.parse.quote(TABLE)}?{params}"
req = urllib.request.Request(
    url,
    headers={"Authorization": f"Bearer {TOKEN}"},
    method="DELETE"
)
with urllib.request.urlopen(req) as r:
    result = json.load(r)
print(f"Deleted: {[r['id'] for r in result['records']]}")
```

---

## Field Type Reference

| Airtable type | Write value format |
|---------------|--------------------|
| Single line text | `"value"` |
| Long text / Notes | `"multi\nline\ntext"` |
| Number | `42` or `3.14` |
| Currency | `99.99` |
| Checkbox | `true` or `false` |
| Single select | `"Option Name"` |
| Multiple select | `["Option A", "Option B"]` |
| Date | `"2026-05-18"` |
| Date+time | `"2026-05-18T14:00:00.000Z"` |
| Email | `"user@example.com"` |
| URL | `"https://example.com"` |
| Phone | `"+1 555-000-0000"` |
| Attachment | `[{"url": "https://..."}]` |
| Linked record | `["recXXXXXXXXXXXXXX"]` (array of record IDs) |
| User | `[{"id": "usrXXXXXXXXXXXXXX"}]` |
| Formula / Rollup | Read-only — cannot write |
| Auto-number | Read-only — cannot write |

---

## Checklist

- [ ] `AIRTABLE_TOKEN` set in environment (Personal Access Token, not legacy API key)
- [ ] Token scopes include `data.records:read` and `data.records:write`
- [ ] Base ID extracted from URL (`appXXXXXXXXXXXXXX`)
- [ ] Table name URL-encoded when used in requests
- [ ] Batch operations limited to 10 records per request
- [ ] Pagination implemented for tables with > 100 records (use `offset`)
- [ ] Formula fields and auto-number fields not written to
