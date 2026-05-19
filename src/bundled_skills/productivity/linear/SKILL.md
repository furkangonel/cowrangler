---
name: linear
description: Linear project management — issues, cycles, and projects via GraphQL API.
platforms: [linux, macos, windows]
tags: [linear, project-management, issues, graphql, api, sprints, cycles]
---

# Linear Project Management SOP

Create and update issues, manage cycles (sprints), query project status, and automate workflows via the Linear GraphQL API.

## When to Use

- User wants to create a new Linear issue
- User wants to update issue status, priority, or assignee
- User wants to list issues for a team or cycle
- User wants to query active sprint / cycle progress
- User wants to bulk-create or bulk-update issues

---

## Part 1 — Auth Setup

### 1. Get an API Key

1. Go to [https://linear.app/settings/api](https://linear.app/settings/api)
2. Click **Create key** → name it → copy the key (shown only once)

```bash
export LINEAR_API_KEY="lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Or store in `~/.cowrangler/credentials.env`:
```
LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### GraphQL Helper

```bash
LINEAR_API_KEY="${LINEAR_API_KEY:-$(grep '^LINEAR_API_KEY=' ~/.cowrangler/credentials.env 2>/dev/null | cut -d= -f2 | tr -d '\n\r')}"

linear_query() {
  # Usage: linear_query '{ viewer { id name } }'
  curl -s -X POST https://api.linear.app/graphql \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"$1\"}"
}

linear_mutate() {
  # Usage: linear_mutate 'mutation { ... }' '{"input": {...}}'
  curl -s -X POST https://api.linear.app/graphql \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"$1\", \"variables\": $2}"
}
```

### Verify Auth

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ viewer { id name email } }"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['viewer'])"
```

---

## Part 2 — Key IDs You'll Need

Before creating issues, discover your team and workflow state IDs:

```bash
# List all teams
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ teams { nodes { id name key } } }"}' \
  | python3 -c "
import sys, json
teams = json.load(sys.stdin)['data']['teams']['nodes']
for t in teams:
    print(f\"{t['id']}  {t['key']:10s}  {t['name']}\")
"
```

```bash
# List workflow states for a team
TEAM_ID="your-team-id"
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"{ workflowStates(filter: { team: { id: { eq: \\\"$TEAM_ID\\\" } } }) { nodes { id name type } } }\" }" \
  | python3 -c "
import sys, json
states = json.load(sys.stdin)['data']['workflowStates']['nodes']
for s in states:
    print(f\"{s['id']}  {s['type']:12s}  {s['name']}\")
"
```

---

## Part 3 — Issues

### Create an Issue

```python
import os, json, urllib.request

API_KEY = os.environ["LINEAR_API_KEY"]

def linear(query, variables=None):
    body = {"query": query}
    if variables:
        body["variables"] = variables
    req = urllib.request.Request(
        "https://api.linear.app/graphql",
        data=json.dumps(body).encode(),
        headers={"Authorization": API_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)

result = linear(
    """
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          url
          title
        }
      }
    }
    """,
    {
        "input": {
            "teamId": "TEAM_ID",
            "title": "Add rate limiting to the API",
            "description": "Implement token-bucket rate limiting on all public endpoints.\n\n## Acceptance Criteria\n- 100 req/min per API key\n- Returns 429 with Retry-After header\n- Logged in metrics dashboard",
            "priority": 2,          # 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low
            "stateId": "STATE_ID",  # "Todo" state ID from workflow states query
            "assigneeId": "USER_ID",  # optional
            "estimate": 3,           # story points, optional
            "labelIds": ["LABEL_ID"],  # optional
        }
    }
)
issue = result["data"]["issueCreate"]["issue"]
print(f"Created {issue['identifier']}: {issue['url']}")
```

### Update an Issue

```python
result = linear(
    """
    mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue { id identifier title state { name } }
      }
    }
    """,
    {
        "id": "ISSUE_ID",
        "input": {
            "stateId": "IN_PROGRESS_STATE_ID",
            "assigneeId": "USER_ID",
            "priority": 1,  # Urgent
        }
    }
)
print(result["data"]["issueUpdate"]["issue"])
```

### List Team Issues

```python
result = linear(
    """
    query TeamIssues($teamId: String!, $states: [String!]) {
      issues(
        filter: {
          team: { id: { eq: $teamId } }
          state: { type: { in: $states } }
        }
        orderBy: priority
        first: 50
      ) {
        nodes {
          id
          identifier
          title
          priority
          state { name }
          assignee { name }
          estimate
          dueDate
        }
      }
    }
    """,
    {
        "teamId": "TEAM_ID",
        "states": ["started", "unstarted"]  # state types: triage, backlog, unstarted, started, completed, cancelled
    }
)
for issue in result["data"]["issues"]["nodes"]:
    assignee = issue["assignee"]["name"] if issue["assignee"] else "unassigned"
    print(f"{issue['identifier']:12s}  P{issue['priority']}  {assignee:20s}  {issue['title']}")
```

### Search Issues

```python
result = linear(
    """
    query SearchIssues($query: String!) {
      issueSearch(query: $query, first: 20) {
        nodes {
          identifier
          title
          state { name }
          url
        }
      }
    }
    """,
    {"query": "rate limiting"}
)
for issue in result["data"]["issueSearch"]["nodes"]:
    print(f"{issue['identifier']}  [{issue['state']['name']}]  {issue['title']}")
```

---

## Part 4 — Cycles (Sprints)

### List Active Cycle

```python
result = linear(
    """
    query ActiveCycle($teamId: String!) {
      cycles(
        filter: {
          team: { id: { eq: $teamId } }
          isActive: { eq: true }
        }
      ) {
        nodes {
          id
          number
          name
          startsAt
          endsAt
          progress
          completedIssueCountHistory
          issueCountHistory
        }
      }
    }
    """,
    {"teamId": "TEAM_ID"}
)
cycles = result["data"]["cycles"]["nodes"]
if cycles:
    c = cycles[0]
    print(f"Cycle {c['number']}: {c['name']}")
    print(f"  {c['startsAt'][:10]} → {c['endsAt'][:10]}")
    print(f"  Progress: {c['progress']*100:.0f}%")
```

### List Issues in Active Cycle

```python
CYCLE_ID = "your-cycle-id"
result = linear(
    """
    query CycleIssues($cycleId: String!) {
      cycle(id: $cycleId) {
        number
        name
        issues(first: 100, orderBy: priority) {
          nodes {
            identifier
            title
            state { name type }
            assignee { name }
            estimate
          }
        }
      }
    }
    """,
    {"cycleId": CYCLE_ID}
)
data = result["data"]["cycle"]
print(f"Cycle {data['number']}: {data['name']}")
for issue in data["issues"]["nodes"]:
    done = "X" if issue["state"]["type"] == "completed" else " "
    assignee = issue["assignee"]["name"] if issue["assignee"] else "-"
    print(f"  [{done}] {issue['identifier']:12s}  {assignee:15s}  {issue['title']}")
```

### Add Issue to Cycle

```python
result = linear(
    """
    mutation AddToCycle($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
      }
    }
    """,
    {"id": "ISSUE_ID", "input": {"cycleId": "CYCLE_ID"}}
)
```

---

## Part 5 — Bulk Operations

### Bulk Create Issues from a List

```python
titles = [
    ("Set up CI pipeline", 2),
    ("Write API documentation", 3),
    ("Add error monitoring", 2),
]

for title, priority in titles:
    result = linear(
        """
        mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            issue { identifier url }
          }
        }
        """,
        {"input": {"teamId": "TEAM_ID", "title": title, "priority": priority}}
    )
    issue = result["data"]["issueCreate"]["issue"]
    print(f"Created {issue['identifier']}: {title}")
```

---

## Priority and State Reference

| Priority | Value |
|----------|-------|
| No priority | 0 |
| Urgent | 1 |
| High | 2 |
| Medium | 3 |
| Low | 4 |

| State type | Meaning |
|------------|---------|
| `triage` | Needs review |
| `backlog` | Not yet planned |
| `unstarted` | Planned, not started |
| `started` | In progress |
| `completed` | Done |
| `cancelled` | Won't do |

---

## Checklist

- [ ] `LINEAR_API_KEY` set in environment
- [ ] Team ID retrieved via teams query
- [ ] Workflow state IDs retrieved for the target team
- [ ] Issues created with correct `teamId`, `stateId`
- [ ] Cycle ID retrieved if assigning to a sprint
- [ ] Priority values follow 0–4 scale
