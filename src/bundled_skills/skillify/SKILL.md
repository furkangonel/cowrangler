---
name: skillify
description: Capture the current session's repeatable process as a new reusable skill (SKILL.md)
when_to_use: Use at the end of a session when the user wants to save what was done as a reusable procedure. Triggers include "bunu skill olarak kaydet", "skill oluştur", "bu süreci kaydet", "tekrar kullanmak istiyorum", "skillify", "create a skill from this", "save this workflow", "automate this for next time", "bunu SOP'a çevir". Also useful when the same multi-step workflow has been done 2+ times and should be automated.
argument-hint: "[optional: description of what to capture]"
---

# Skillify Skill

## Goal
Analyze the current session's work, identify the repeatable process within it, and create a well-structured SKILL.md that captures that process for future use.

## Steps

### 1. Identify the repeatable process
Look at what was done in this session:
- What was the user's original request?
- What steps were taken to fulfill it?
- Which steps were mechanical/repeatable vs. one-off judgment calls?

A good skill captures the repeatable mechanical steps and the judgment criteria — not the one-time context.

**Success criteria**: You can describe the skill in one sentence: "This skill [does what] [when what trigger]."

### 2. Interview the user (if needed)
Ask:
- "What should trigger this skill in the future?" (the when_to_use)
- "Are there variations of this task I should handle?" (edge cases)
- "What's the most important thing to get right?" (success criteria)
- "Which tools should be available to this skill?" (allowed-tools)

If the session was clear enough, skip to step 3.

**Success criteria**: You have enough information to write a when_to_use that will trigger reliably.

### 3. Choose the skill location
- **Project-specific** (`.cowrangler/skills/<name>/`): Workflow is specific to this codebase
- **Global** (`~/.cowrangler/skills/<name>/`): Workflow is general-purpose, useful across projects

Ask the user if not obvious.

### 4. Write the SKILL.md
Follow this template strictly:

```markdown
---
name: [kebab-case-name]
description: [One line: what it does and when]
when_to_use: Use when [trigger condition]. Triggers include "[example phrase 1]", "[example phrase 2]". Also trigger when [secondary trigger].
argument-hint: "[input the user should provide]"
allowed-tools: [comma-separated list, or omit for all tools]
---

# [Skill Title]

## Goal
[What this skill achieves — the outcome, not the process]

## Steps

### 1. [Step name]
[What to do, concretely]

**Success criteria**: [How you know this step is done correctly]

### 2. [Step name]
...
```

**Key quality checks:**
- `when_to_use` must include 4+ example trigger phrases
- Each step must have a concrete "Success criteria"  
- The Goal describes outcome, not process
- Steps are ordered and numbered

### 5. Create the skill file
Use `create_folder` and `write_file` to create the SKILL.md at the chosen location.

Then use `utilize_skill` with the new skill name to verify it loads correctly.

**Success criteria**: Skill appears in `list_skills` output and the when_to_use description accurately reflects when it should trigger.

### 6. Confirm with user
Show the final SKILL.md to the user and ask:
- "Does this capture what you intended?"
- "Any scenarios to add?"

Make any requested adjustments.
