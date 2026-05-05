---
name: prompt-engineer
description: Turn vague instructions into precision-crafted prompts and system messages that get the best out of any LLM
when_to_use: Use when the user wants to create, improve, or optimize an AI prompt. Triggers include "prompt yaz", "sistem mesajı oluştur", "mega prompt", "bu promptu düzelt", "yapay zekaya nasıl sormalıyım", "LLM için talimat yaz", "prompt engineering", "system prompt", "write a prompt for", "optimize this prompt", "make this instruction better", "AI agent için talimat". Also trigger when user pastes a weak prompt and asks why it doesn't work well.
argument-hint: "[goal or existing prompt]"
---

# Prompt Engineer Skill

## Goal
Transform vague, incomplete, or underperforming prompts into precisely crafted instructions that reliably produce the intended output from an LLM.

## Prompt Engineering Fundamentals

### The Six Dimensions
Every strong prompt addresses:
1. **Role** — Who is the model? What expertise does it bring?
2. **Task** — What exactly should it do? (verb + noun: "analyze", "write", "classify")
3. **Context** — What background does the model need to succeed?
4. **Format** — What should the output look like? (length, structure, examples)
5. **Constraints** — What should it avoid? (tone, topics, length limits)
6. **Examples** — Few-shot examples for consistency (optional but powerful)

## Steps

### 1. Diagnose the existing prompt (if one exists)
If the user has a prompt that "doesn't work":
- What output is it producing?
- What output is desired?
- Which of the six dimensions is missing or weak?

Name the specific problem before prescribing a fix.

**Success criteria**: You can say "this prompt fails because [specific reason]."

### 2. Gather requirements
Ask (or infer from context):
- What model will this run on? (GPT-4, Claude, Gemini, Llama — each has different strengths)
- Is this a system prompt, user prompt, or both?
- Will it be used once or repeatedly at scale?
- What's the most common failure mode the user wants to prevent?

**Success criteria**: You know the model, use case, and primary failure mode.

### 3. Write the prompt
Apply these techniques based on the use case:

**For complex reasoning tasks:**
- Add "Think step by step before answering"
- Use XML tags to separate sections: `<context>`, `<task>`, `<format>`
- Include a "before you respond, check:" section

**For consistent formatting:**
- Provide an exact output template with placeholders
- Add a negative example: "Do NOT format it like this: [bad example]"

**For role-playing/personas:**
- Define expertise: "You are a senior [role] with [X] years experience in [domain]"
- Define behavioral constraints: "You communicate in [style]. You never [bad behavior]."

**For classification/extraction:**
- Define every category with an example
- Handle edge cases explicitly: "If you can't determine X, output 'UNKNOWN'"

### 4. Stress-test the prompt
Mentally run through 3 edge cases:
- A minimal/ambiguous input
- An off-topic input
- A tricky input that could fail

Identify which edge cases need explicit handling in the prompt.

**Success criteria**: You've identified at least one way the prompt could fail and addressed it.

### 5. Deliver with explanation
Return:
1. The complete prompt (in a code block, ready to copy)
2. A **Why it works** section explaining the key design choices
3. Suggested variables/parameters if the prompt should be templated

**Success criteria**: User can copy-paste and get reliable results without further changes.
