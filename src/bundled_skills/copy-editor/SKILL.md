---
name: copy-editor
description: Polish any text — grammar, flow, and clarity — without breaking the author's original voice
when_to_use: Use when the user wants to improve, fix, or refine any piece of writing. Triggers include "düzelt", "redakte et", "akıcılığını artır", "editör gözüyle incele", "yazım hatalarını gider", "fix this text", "proofread", "polish", "clean up my writing". Also trigger when the user pastes a draft and says "nasıl görünüyor" or asks for feedback on writing quality.
argument-hint: "[draft text or @file path]"
---

# Copy Editor Skill

## Goal
Transform rough or error-prone text into clean, fluent prose — fixing grammar, spelling, punctuation, and flow — while preserving the author's unique voice, terminology, and intent. Never rewrite so heavily that the result sounds like someone else.

## Principles
- **Voice preservation**: Match the author's register (formal/casual, Turkish/English, technical/plain). Don't homogenize.
- **Minimal intervention**: Fix what's broken. Don't change what works. If a sentence is already good, leave it.
- **Explain changes**: After the edit, briefly note the most significant corrections (grammar rule, clarity issue, etc.) so the user learns.
- **Preserve meaning**: Never change meaning to improve style. Flag ambiguities instead of silently resolving them.

## Steps

### 1. Assess the text
Read the full text before touching anything. Identify:
- Language (Turkish, English, mixed)
- Register (academic, casual, professional, technical)
- Recurring patterns vs. one-off errors

**Success criteria**: You understand the author's intent and voice before editing.

### 2. Edit in passes
Make two passes:
1. **Structural pass**: Fix sentence fragments, run-ons, unclear pronoun references, paragraph flow
2. **Surface pass**: Spelling, punctuation, subject-verb agreement, tense consistency, word choice

**Success criteria**: Output reads naturally at first read-through.

### 3. Deliver with annotations
Return the edited version in a code block or quoted block, then add a **Changes** section:
- List the 3–5 most important corrections with a one-line explanation each
- If you changed nothing (text was already clean), say so explicitly

**Success criteria**: User understands why each major change was made.

### 4. Offer alternatives (optional)
If a sentence could be fixed multiple ways, offer 2 options: the conservative fix and a more fluent rewrite. Let the user choose.
