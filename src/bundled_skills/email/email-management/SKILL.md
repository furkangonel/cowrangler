---
name: email-management
description: Inbox management workflow — triage, batching, folder strategy, and inbox zero maintenance
platforms: [linux, macos, windows]
tags: [email, inbox, productivity, triage, organization, inbox-zero]
---

# Email Management SOP

## Goal
Process email systematically so the inbox stays clear, nothing falls through the cracks, and email doesn't bleed into deep work time.

## Core Principle: 4D Triage

For every email, apply exactly one action immediately:

| Decision | When | Action |
|---|---|---|
| **Delete** | Newsletters, FYIs, CC'd you unnecessarily | Archive or delete immediately |
| **Delegate** | Someone else should own this | Forward with clear ask, move to "Waiting" |
| **Do** | Takes under 2 minutes | Reply now, then archive |
| **Defer** | Needs thought, research, or specific time | Move to task manager or snooze |

**Rule**: Never leave an email in the inbox after making a decision.

## Batch Processing Schedule

Do not check email continuously. Batch to 2-3 times per day:

| Time | Purpose |
|---|---|
| Morning (9am) | Full triage — clear inbox, action urgent items |
| Midday (12-1pm) | Quick scan — replies only, no new tasks |
| EOD (5pm) | Final sweep — defer anything not done today |

Turn off push notifications. Check on your schedule.

## Folder / Label Taxonomy

```
Inbox                     ← Only unprocessed email lives here
├── Action                ← Needs reply or action from you
├── Waiting               ← Delegated; waiting on others
├── Reference/
│   ├── Finance           ← Invoices, receipts, contracts
│   ├── HR                ← Offer letters, benefits, onboarding
│   ├── Projects/         ← One subfolder per active project
│   └── Personal          ← Non-work reference
└── Archive               ← Everything else (searchable, not filed)
```

**Key rule**: Archive aggressively. The search bar is more reliable than folder filing.

## Email Rules / Filters to Set Up

Automate triage with filters (Gmail, Outlook, Apple Mail all support this):

```
Rule: Newsletter/marketing
  FROM contains: unsubscribe | noreply | newsletter | digest
  → Skip inbox, label "Newsletter", mark read

Rule: CC'd only
  TO does not contain: [your email]
  → Skip inbox, label "CC", mark read

Rule: GitHub/Linear/Jira notifications
  FROM: notifications@github.com | linear.app | jira
  → Skip inbox, label "Dev Tools", mark read

Rule: Calendar invites
  Contains: .ics attachment OR subject contains "invitation"
  → Keep in inbox (needs action)

Rule: Receipts
  FROM: receipt | invoice | order | billing
  → Label "Finance/Receipts", mark read
```

## SLA by Sender Type

Set expectations internally for yourself:

| Sender | Response time |
|---|---|
| Manager / exec | Same day or within 4 hours |
| Direct reports | Within 24 hours |
| Colleagues | Within 48 hours |
| External clients | Within 24 hours (business days) |
| Vendors / cold | 48-72 hours or never |
| Newsletters | Never (read or delete) |

## Unsubscribe Workflow

For any newsletter or marketing email:
1. Open the email
2. Scroll to the bottom → click "Unsubscribe"
3. If no unsubscribe link: create a filter to auto-delete
4. Never "unsubscribe" by replying — it confirms an active address

**Tools**: Unroll.me (audit), Gmail's built-in unsubscribe button, HEY's "The Screener"

## Inbox Zero Maintenance

### Weekly reset (Fridays, 10 min)
- [ ] Archive everything in "Action" that's been resolved
- [ ] Follow up on anything in "Waiting" older than 5 days
- [ ] Empty "Newsletter" label (read or delete)
- [ ] Check snooze queue for anything resurfacing next week

### Monthly audit (15 min)
- [ ] Review active project folders — archive completed projects
- [ ] Update email filters (any new noise sources?)
- [ ] Unsubscribe from any new lists that snuck through

## Task Manager Integration

Never use the inbox as a to-do list. When an email requires action:

1. Create a task in your task manager (Linear, Notion, Things, etc.)
2. Include: task title + link to email + due date
3. Archive the email immediately
4. Work the task from your task manager, not your inbox

```
Task: "Review and sign contract — ACME Corp"
Link: [Gmail URL or message ID]
Due: 2024-01-20
```

## Templates for Common Replies

### Acknowledge and defer
```
Hi [Name],

Got it — I'll review this and get back to you by [specific day].

[Name]
```

### Clarify before acting
```
Hi [Name],

Happy to help with this. Before I dive in, can you clarify:
1. [Question]
2. [Question]

[Name]
```

### Out of office / at capacity
```
Hi [Name],

I'm currently at capacity and won't be able to take this on until [date].

For urgent matters, please contact [alternative person/email].

[Name]
```

## Anti-Patterns to Avoid

- **Reply-all by default** — only include people who need to act
- **Long threads with no resolution** — pick up the phone after 3 replies
- **Leaving emails "marked unread" as a reminder** — use snooze or task manager
- **CC'ing as CYA** — wastes everyone's time; document decisions elsewhere
- **Sending email after 10pm** — schedule send for morning instead
- **Using email for urgent matters** — use Slack/phone for anything time-sensitive
