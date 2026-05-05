---
name: localization
description: Localize (not just translate) text, UI content, or marketing copy to feel native in the target culture
when_to_use: Use when translation alone isn't enough — the cultural context, idioms, or tone also need to adapt. Triggers include "lokalize et", "yerelleştir", "Türkçe'ye uyarla", "kültürel uyarlama", "transcreation", "localize", "adapt for [locale]", "make it sound native", "UI translation", "i18n", "l10n". Also trigger when the user pastes UI strings, marketing copy, or documentation and asks for translation with a cultural fit requirement.
argument-hint: "[source text] [target locale, e.g. tr-TR, de-DE]"
---

# Localization Skill

## Goal
Produce target-language content that feels like it was written natively — not translated. Preserve meaning and intent while adapting cultural references, idioms, tone, and register for the target audience.

## Distinction: Translation vs. Localization vs. Transcreation

| Mode | When to use |
|------|-------------|
| **Translation** | Technical docs, legal text, factual content — accuracy > naturalness |
| **Localization** | UI strings, user-facing messages, product copy — natural + accurate |
| **Transcreation** | Marketing slogans, emotional copy, humor — intent and feeling > literal meaning |

Identify which mode applies before starting.

## Steps

### 1. Identify source and target
Confirm: source language, target locale (e.g. `tr-TR`, `de-DE`, not just `German`), content type (UI, marketing, technical, legal).

If the target locale isn't specified, ask.

**Success criteria**: You know the exact target audience (region + formality level).

### 2. First pass — literal translation
Translate accurately, preserving all meaning. Note every idiom, cultural reference, or humor that won't land in the target culture — flag with [ADAPT].

**Success criteria**: Nothing is lost in meaning; adaptation candidates are clearly marked.

### 3. Second pass — cultural adaptation
For each [ADAPT] flag:
- Replace idioms with target-culture equivalents (not literal translations)
- Adjust formality: Turkish has T/V distinction (sen/siz); German has du/Sie — match the brand voice
- Localize examples, measurements, date formats, currency
- Adapt humor: if it doesn't translate, replace with something that achieves the same effect

**Success criteria**: A native speaker would not identify the text as translated.

### 4. Technical localization (if applicable)
- Placeholder handling: `{name}`, `%s`, `{{variable}}` — preserve all placeholders exactly
- String length: UI strings often have length constraints — flag anything that grew >20%
- RTL languages: flag if target is Arabic/Hebrew and layout changes may be needed

### 5. Deliver with notes
Return the localized text, then add a **Localization Notes** section explaining:
- Major cultural adaptations made and why
- Any ambiguities where multiple valid choices existed
- Length warnings for UI strings

**Success criteria**: Developer/designer can implement without guessing at intent.
