---
name: notion
description: Notion workspace management via API — pages, databases, blocks.
platforms: [linux, macos, windows]
tags: [notion, productivity, api, databases, pages, workspace]
---

# Notion Workspace Management SOP

Manage Notion content programmatically: create and update pages, query databases, write blocks, and automate workspace workflows via the Notion REST API.

## When to Use

- User wants to create a new Notion page or sub-page
- User wants to add records to a Notion database
- User wants to query a database with filters or sorts
- User wants to update existing page content or properties
- User wants to read a page's blocks or a database's schema

---

## Part 1 — Auth Setup

### 1. Create an Integration

1. Go to [https://www.notion.so/profile/integrations](https://www.notion.so/profile/integrations)
2. Click **New integration** → give it a name → select the workspace
3. Copy the **Internal Integration Secret** — this is your `NOTION_API_KEY`

### 2. Connect Pages to the Integration

Every page or database the integration should access must be explicitly shared:

1. Open the page/database in Notion
2. Click **...** (top right) → **Connections** → find your integration → **Confirm**

### 3. Set the Environment Variable

```bash
export NOTION_API_KEY="secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Or store it in `~/.cowrangler/credentials.env`:
```
NOTION_API_KEY=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Auth Helper (shell)

```bash
NOTION_API_KEY="${NOTION_API_KEY:-$(grep '^NOTION_API_KEY=' ~/.cowrangler/credentials.env 2>/dev/null | cut -d= -f2 | tr -d '\n\r')}"
NOTION_VERSION="2022-06-28"

notion_get() {
  curl -s -X GET "https://api.notion.com/v1/$1" \
    -H "Authorization: Bearer $NOTION_API_KEY" \
    -H "Notion-Version: $NOTION_VERSION" \
    -H "Content-Type: application/json"
}

notion_post() {
  curl -s -X POST "https://api.notion.com/v1/$1" \
    -H "Authorization: Bearer $NOTION_API_KEY" \
    -H "Notion-Version: $NOTION_VERSION" \
    -H "Content-Type: application/json" \
    -d "$2"
}

notion_patch() {
  curl -s -X PATCH "https://api.notion.com/v1/$1" \
    -H "Authorization: Bearer $NOTION_API_KEY" \
    -H "Notion-Version: $NOTION_VERSION" \
    -H "Content-Type: application/json" \
    -d "$2"
}
```

---

## Part 2 — Key Concepts

| Object | What it is | API path |
|--------|------------|----------|
| **Page** | A Notion page (can be inside a database or standalone) | `/pages/{id}` |
| **Database** | A structured collection of pages with typed properties | `/databases/{id}` |
| **Block** | A content unit inside a page (paragraph, heading, todo, etc.) | `/blocks/{id}/children` |
| **Property** | A column in a database (title, text, select, date, relation, etc.) | Part of page object |

**Finding IDs:** Copy a page/database URL from Notion — the 32-char hex string at the end (with or without hyphens) is the ID.

```
https://www.notion.so/My-Page-abc123def456...
                        ^^^^^^^^^^^^^^^^^^^^ — page ID (add hyphens: 8-4-4-4-12)
```

---

## Part 3 — Pages

### Create a Standalone Page

```bash
notion_post "pages" '{
  "parent": { "page_id": "PARENT_PAGE_ID" },
  "properties": {
    "title": {
      "title": [{ "text": { "content": "My New Page" } }]
    }
  },
  "children": [
    {
      "object": "block",
      "type": "paragraph",
      "paragraph": {
        "rich_text": [{ "type": "text", "text": { "content": "Welcome to my page." } }]
      }
    }
  ]
}'
```

### Read a Page's Properties

```bash
notion_get "pages/PAGE_ID" | python3 -c "
import sys, json
page = json.load(sys.stdin)
title = page['properties']['title']['title'][0]['plain_text']
print('Title:', title)
print('URL:', page['url'])
"
```

### Update a Page's Properties

```bash
notion_patch "pages/PAGE_ID" '{
  "properties": {
    "title": {
      "title": [{ "text": { "content": "Updated Title" } }]
    }
  }
}'
```

### Archive (soft-delete) a Page

```bash
notion_patch "pages/PAGE_ID" '{ "archived": true }'
```

---

## Part 4 — Databases

### Query a Database (with filter and sort)

```bash
notion_post "databases/DATABASE_ID/query" '{
  "filter": {
    "and": [
      {
        "property": "Status",
        "select": { "equals": "In Progress" }
      },
      {
        "property": "Due Date",
        "date": { "before": "2026-06-01" }
      }
    ]
  },
  "sorts": [
    { "property": "Due Date", "direction": "ascending" }
  ],
  "page_size": 50
}' | python3 -c "
import sys, json
data = json.load(sys.stdin)
for page in data['results']:
    props = page['properties']
    title = props['Name']['title'][0]['plain_text'] if props['Name']['title'] else '(untitled)'
    status = props.get('Status', {}).get('select', {}).get('name', '-')
    print(f'{title:40s}  {status}')
"
```

### Create a Database Entry (row)

```bash
notion_post "pages" '{
  "parent": { "database_id": "DATABASE_ID" },
  "properties": {
    "Name": {
      "title": [{ "text": { "content": "New Task" } }]
    },
    "Status": {
      "select": { "name": "To Do" }
    },
    "Due Date": {
      "date": { "start": "2026-05-30" }
    },
    "Assignee": {
      "people": [{ "id": "USER_ID" }]
    },
    "Tags": {
      "multi_select": [
        { "name": "backend" },
        { "name": "urgent" }
      ]
    }
  }
}'
```

### Retrieve Database Schema

```bash
notion_get "databases/DATABASE_ID" | python3 -c "
import sys, json
db = json.load(sys.stdin)
print('Database:', db['title'][0]['plain_text'])
print('\nProperties:')
for name, prop in db['properties'].items():
    print(f'  {name:30s}  {prop[\"type\"]}')
"
```

### Paginate Through All Results

```bash
python3 << 'EOF'
import os, json, urllib.request

API_KEY = os.environ['NOTION_API_KEY']
DATABASE_ID = "DATABASE_ID"

def query(cursor=None):
    body = {"page_size": 100}
    if cursor:
        body["start_cursor"] = cursor
    req = urllib.request.Request(
        f"https://api.notion.com/v1/databases/{DATABASE_ID}/query",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)

all_pages = []
cursor = None
while True:
    data = query(cursor)
    all_pages.extend(data["results"])
    if not data["has_more"]:
        break
    cursor = data["next_cursor"]

print(f"Total records: {len(all_pages)}")
EOF
```

---

## Part 5 — Blocks (Page Content)

### Append Blocks to a Page

```bash
notion_patch "blocks/PAGE_ID/children" '{
  "children": [
    {
      "object": "block",
      "type": "heading_2",
      "heading_2": {
        "rich_text": [{ "type": "text", "text": { "content": "Meeting Notes" } }]
      }
    },
    {
      "object": "block",
      "type": "bulleted_list_item",
      "bulleted_list_item": {
        "rich_text": [{ "type": "text", "text": { "content": "Discussed Q2 roadmap" } }]
      }
    },
    {
      "object": "block",
      "type": "to_do",
      "to_do": {
        "rich_text": [{ "type": "text", "text": { "content": "Send follow-up email" } }],
        "checked": false
      }
    },
    {
      "object": "block",
      "type": "code",
      "code": {
        "rich_text": [{ "type": "text", "text": { "content": "npm install" } }],
        "language": "shell"
      }
    }
  ]
}'
```

### Read a Page's Blocks

```bash
notion_get "blocks/PAGE_ID/children?page_size=100" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for block in data['results']:
    btype = block['type']
    content = block.get(btype, {}).get('rich_text', [])
    text = ''.join(t['plain_text'] for t in content) if content else ''
    print(f'[{btype:25s}] {text[:80]}')
"
```

---

## Part 6 — Common Patterns

### Meeting Notes Template

```python
import os, json, urllib.request, datetime

API_KEY = os.environ["NOTION_API_KEY"]
PARENT_PAGE_ID = "YOUR_NOTES_PAGE_ID"
today = datetime.date.today().isoformat()

body = {
    "parent": {"page_id": PARENT_PAGE_ID},
    "properties": {
        "title": {"title": [{"text": {"content": f"Meeting Notes — {today}"}}]}
    },
    "children": [
        {"object": "block", "type": "heading_2",
         "heading_2": {"rich_text": [{"type": "text", "text": {"content": "Attendees"}}]}},
        {"object": "block", "type": "bulleted_list_item",
         "bulleted_list_item": {"rich_text": [{"type": "text", "text": {"content": ""}}]}},
        {"object": "block", "type": "heading_2",
         "heading_2": {"rich_text": [{"type": "text", "text": {"content": "Agenda"}}]}},
        {"object": "block", "type": "numbered_list_item",
         "numbered_list_item": {"rich_text": [{"type": "text", "text": {"content": ""}}]}},
        {"object": "block", "type": "heading_2",
         "heading_2": {"rich_text": [{"type": "text", "text": {"content": "Action Items"}}]}},
        {"object": "block", "type": "to_do",
         "to_do": {"rich_text": [{"type": "text", "text": {"content": ""}}], "checked": False}},
    ],
}
req = urllib.request.Request(
    "https://api.notion.com/v1/pages",
    data=json.dumps(body).encode(),
    headers={"Authorization": f"Bearer {API_KEY}", "Notion-Version": "2022-06-28",
             "Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req) as r:
    page = json.load(r)
print("Created:", page["url"])
```

---

## Property Type Reference

| Type | Write format |
|------|-------------|
| `title` | `{"title": [{"text": {"content": "..."}}]}` |
| `rich_text` | `{"rich_text": [{"text": {"content": "..."}}]}` |
| `number` | `{"number": 42}` |
| `select` | `{"select": {"name": "Option"}}` |
| `multi_select` | `{"multi_select": [{"name": "A"}, {"name": "B"}]}` |
| `date` | `{"date": {"start": "2026-05-18"}}` |
| `checkbox` | `{"checkbox": true}` |
| `url` | `{"url": "https://example.com"}` |
| `email` | `{"email": "user@example.com"}` |
| `people` | `{"people": [{"id": "USER_ID"}]}` |
| `relation` | `{"relation": [{"id": "PAGE_ID"}]}` |

---

## Checklist

- [ ] Integration created at notion.so/profile/integrations
- [ ] Integration connected to the target page/database (via Connections menu)
- [ ] `NOTION_API_KEY` set in environment
- [ ] Page/database IDs extracted from URLs
- [ ] Pagination handled for database queries returning > 100 results
