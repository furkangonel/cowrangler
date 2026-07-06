---
name: creative-ideation
description: Structured brainstorming sessions using proven ideation techniques.
platforms: [linux, macos, windows]
tags: [brainstorming, creativity, ideation, problem-solving, design-thinking, innovation]
---

# Creative Ideation SOP


## When to Use

- User needs ideas for a product, feature, campaign, or story
- User says "brainstorm", "I'm stuck", "give me ideas", "what could I do with..."
- User wants to explore a problem space before committing to a solution
- User needs to break out of a creative rut

---

## Step 1 — Frame the Challenge

Before generating ideas, nail down the challenge statement. Use **How Might We (HMW)** format:

> "How might we [verb] [object] so that [desired outcome]?"

**Examples:**
- "How might we reduce onboarding friction for enterprise users so that activation takes < 5 minutes?"
- "How might we make our weekly newsletter feel like a conversation so that readers reply?"

Ask the user to confirm or refine the HMW before proceeding to ideation.

---

## The 5 Techniques

---

### Technique 1 — SCAMPER

Apply each lens to the subject and generate at least 2 ideas per letter:

| Letter | Question | Apply to: _[subject]_ |
|--------|----------|----------------------|
| **S**ubstitute | What can be replaced? | |
| **C**ombine | What can be merged or bundled? | |
| **A**dapt | What can be borrowed from elsewhere? | |
| **M**odify / Magnify | What can be exaggerated or scaled? | |
| **P**ut to other uses | What else can this do? | |
| **E**liminate | What can be removed entirely? | |
| **R**everse / Rearrange | What if you flip the order or approach? | |

**Output format:**
```
SCAMPER — [Subject]

S: [Idea 1], [Idea 2]
C: [Idea 1], [Idea 2]
A: [Idea 1], [Idea 2]
M: [Idea 1], [Idea 2]
P: [Idea 1], [Idea 2]
E: [Idea 1], [Idea 2]
R: [Idea 1], [Idea 2]
```

---

### Technique 2 — Reverse Brainstorming

Instead of solving the problem, brainstorm how to **make it worse**. Then flip each answer.

**Steps:**
1. Reverse the challenge: "How might we CAUSE [problem]?"
2. Generate 8–10 ways to make things terrible
3. Reverse each terrible idea into a potential solution

**Example:**
```
Challenge: How might we improve user retention?
Reversed: How might we guarantee users churn immediately?

Terrible ideas → Flipped solutions:
- Make onboarding confusing    → Create a guided, skippable tutorial
- Never send notifications      → Send personalized, timely nudges
- Hide the valuable features    → Surface key features on day 1
- Make cancellation instant     → Add a "pause" option before cancel
```

---

### Technique 3 — Crazy 8s

Generate 8 distinct ideas in 8 minutes. Speed over quality — defer judgment entirely.

**Rules:**
- Each idea gets one sentence max
- No filtering, no "but that's impossible"
- Ideas should vary widely in scale, cost, and approach
- Number them 1–8

**Output format:**
```
Crazy 8s — [Topic]

1. [Wild idea]
2. [Obvious idea]
3. [Expensive idea]
4. [Free/simple idea]
5. [Tech-heavy idea]
6. [Human/offline idea]
7. [Stolen from another industry]
8. [Opposite of what's expected]
```

After listing, ask the user: "Which 1–3 feel most worth exploring? I'll develop those."

---

### Technique 4 — How Might We (HMW) Expansion

Take one problem space and generate 10+ HMW questions from different angles:

**Angles to cover:**
- Amplify the good
- Remove the bad
- Explore the opposite
- Question assumptions
- Change the context/user
- Combine with something else
- Change the time horizon
- Change the scale (10x bigger / 10x smaller)

**Example output:**
```
HMW questions for "improve developer onboarding":

1. HMW make the first PR feel like a win, not a chore?
2. HMW remove all environment setup friction?
3. HMW turn documentation into an interactive playground?
4. HMW onboard 10 developers simultaneously without a senior engineer?
5. HMW make the codebase self-explaining?
6. HMW compress 2-week onboarding into 2 days?
7. HMW celebrate onboarding milestones automatically?
8. HMW make failing a test feel helpful instead of discouraging?
```

---

### Technique 5 — Mind Map

Build a radial idea tree starting from the core concept:

```
                    [Core Concept]
                    /     |      \
           [Theme A]  [Theme B]  [Theme C]
           /    \       |         /    \
       [Idea]  [Idea] [Idea]  [Idea]  [Idea]
```

**Steps:**
1. Place the core concept at center
2. Identify 4–6 major themes/dimensions
3. Branch 2–4 ideas from each theme
4. Mark cross-connections between branches

**Output:** Use indented text or ASCII tree. Offer to convert to a visual if the user wants it.

```
Core: Subscription Product Retention

├── Engagement
│   ├── Weekly digest email with personalized stats
│   ├── In-app streak / habit tracking
│   └── Community challenges
├── Value Delivery
│   ├── Monthly "wins" report showing ROI
│   ├── Proactive feature discovery tips
│   └── Benchmarking against peers
├── Friction Reduction
│   ├── One-click pause instead of cancel
│   ├── Billing flexibility (pause, downgrade)
│   └── Offboarding interview with save offer
└── Relationship
    ├── Dedicated CSM at $X threshold
    ├── Early access to new features
    └── Annual user conference / virtual event
```

---

## Facilitation Flow

When a user asks for ideation help, follow this sequence:

1. **Frame** — Help them write a clear HMW statement (1–2 exchanges)
2. **Diverge** — Run 1–2 techniques and generate raw ideas without filtering
3. **Cluster** — Group similar ideas and name the clusters
4. **Converge** — Ask which clusters/ideas to develop further
5. **Develop** — Flesh out the top 2–3 ideas with next steps

---

## Output Format for Final Ideas

For each selected idea, provide:

```
## Idea: [Name]

**One-liner:** What it is in one sentence.

**How it works:** 3–5 bullet description.

**Why it might work:** The key insight or assumption.

**Risks / unknowns:** What needs to be validated first.

**Next step:** The smallest experiment to test this.
```

---

## Agent Instructions

1. Start every session by confirming the challenge framing — don't generate ideas on a vague prompt
2. Choose the technique that best fits the context:
   - Existing product → SCAMPER or Reverse Brainstorming
   - Open-ended problem → HMW Expansion or Mind Map
   - Fast divergence needed → Crazy 8s
3. Generate at least 8–10 raw ideas before filtering
4. Never evaluate ideas during divergence — just list them
5. After divergence, explicitly shift: "Now let's narrow down — which of these resonates?"
6. Always end with a concrete next step for the chosen idea
