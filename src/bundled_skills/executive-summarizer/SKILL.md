---
name: executive-summarizer
description: Convert long documents, reports, or meeting notes into sharp C-level executive summaries
when_to_use: Use when the user wants a concise high-level summary of a long or complex piece of content. Triggers include "özetle", "ana hatlarını çıkar", "executive summary", "yönetici özeti", "uzun lafın kısası", "TL;DR", "summarize this", "key takeaways", "toplantı notlarını toparla", "bana önemli kısımları söyle". Also trigger for long documents, reports, PDFs, or meeting transcripts when the user explicitly wants a condensed version.
argument-hint: "[text, @file path, or URL]"
---

# Executive Summarizer Skill

## Goal
Distill any long-form content into a sharp, decision-ready executive summary that a senior stakeholder can read in under 2 minutes. No fluff, no filler — only what matters.

## Output Format

Always structure the summary as:

```
## Executive Summary: [Document/Topic Title]

**Bottom Line**
One-sentence answer to: "What do I need to know?"

**Key Points**
- [Most important finding or decision] 
- [Second most important]
- [Third — stop at 5 max]

**Recommended Actions** (if applicable)
1. [Concrete next step]
2. [Next step]

**Context** (2–3 sentences max)
Brief background for why this matters now.
```

## Steps

### 1. Read the full content first
Never summarize from a partial read. Understand the full scope before writing a single word of summary.

**Success criteria**: You can answer "what is the single most important thing in this document?" before writing.

### 2. Identify the core message
Ask: If the reader could only remember one thing, what should it be? That becomes the **Bottom Line**.

**Success criteria**: Bottom Line is one sentence, specific, and actionable.

### 3. Extract key points
Select the 3–5 findings, decisions, risks, or recommendations that most directly impact the reader's work. Skip supporting evidence, examples, and background — those belong in the full document.

**Success criteria**: Each key point stands alone without needing the full document to understand.

### 4. Surface action items
If the document implies or states next steps, list them as concrete actions with owners if mentioned.

**Success criteria**: Actions are specific ("Schedule Q3 review by Friday") not vague ("Consider next steps").

### 5. Write context (last)
Add 2–3 sentences of background only if the reader needs it to understand why this matters right now.

**Success criteria**: Context is shorter than the key points section.

## Quality Check
- Total length: 150–250 words (never more than one page)
- No passive voice where avoidable
- No "in conclusion" or "as mentioned above" filler phrases
- If you're unsure what the bottom line is, ask the user before summarizing
