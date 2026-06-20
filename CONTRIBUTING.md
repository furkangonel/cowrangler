# Contributing to Cowrangler

Thank you for your interest in contributing! This document covers everything you need to get started.

---

## Development Setup

```bash
git clone https://github.com/furkangonel/cowrangler.git
cd cowrangler
npm install
npm run build
npm link          # installs `cowrangler` globally from local build
```

Set at least one API key:
```bash
cowrangler setup  # interactive wizard
# or manually:
cowrangler key set ANTHROPIC_API_KEY sk-ant-...
```

---

## Project Structure

```
src/
├── core/           # Agent, LLM, context engine, session DB, plugins
│   ├── agent.ts    # Main conversation loop
│   ├── llm.ts      # Provider abstraction
│   ├── logger.ts   # Rotating log files
│   ├── skin.ts     # Theme/skin engine
│   └── ...
├── tools/          # Tool implementations (auto-registered via registry.ts)
├── ui/             # CLI renderer, command router, theme
├── gateway/        # Messaging platform adapters (Telegram, Discord)
├── cron/           # Scheduler + job store
├── kanban/         # Multi-agent work queue
├── batch/          # Batch task runner
├── lsp/            # Language Server Protocol server
└── main.ts         # Entry point, subcommand routing

tests/              # Vitest unit tests
```

---

## Adding a Tool

1. Create `src/tools/my_tool.ts`
2. Register at module level:

```typescript
import { registry } from "./registry.js";

registry.register(
  {
    name: "my_tool",
    description: "Does something useful.",
    parameters: {
      type: "object",
      properties: {
        input: { type: "string", description: "The input" },
      },
      required: ["input"],
    },
  },
  async (args) => {
    const result = doSomething(args.input);
    return JSON.stringify({ result });
  },
);
```

3. Import it in `main.ts` (side-effect registration):
```typescript
import "./tools/my_tool.js";
```

**Rules:**
- All handlers must return a `string` (JSON-serialized)
- Use `try/catch` and return `JSON.stringify({ error: "..." })` on failure
- Never throw from a tool handler — the agent must receive an error message, not crash

---

## Writing a Skill

Skills are Markdown files with YAML frontmatter. Place them in:
- `src/bundled_skills/` — shipped with the package
- `~/.cowrangler/skills/` — user-installed

```markdown
---
name: my-workflow
description: Automates my-workflow process.
version: 1.0.0
---

## When to Use
Describe the trigger condition.

## Steps
1. Step one
2. Step two
```

**Standards:**
- `description` ≤ 60 characters, single sentence, ends with period
- `name` uses kebab-case
- Steps should be specific and actionable

---

## Writing Tests

Tests live in `tests/`. Use Vitest:

```typescript
import { describe, it, expect } from "vitest";

describe("My feature", () => {
  it("does the right thing", () => {
    expect(myFunction(42)).toBe("forty-two");
  });
});
```

Run tests:
```bash
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # with coverage report
```

**Guidelines:**
- Keep tests isolated — no real API calls, no real file system side effects
- Use `os.tmpdir()` for temporary files; clean up in `afterEach`
- Test the logic, not the implementation details

---

## Building

```bash
npm run build   # TypeScript compile + copy assets
npm run clean   # remove dist/
```

The build uses `tsc` only — no bundler. ESM native output.

---

## Pull Request Process

1. Fork the repo and create a feature branch: `git checkout -b feature/my-feature`
2. Write tests for new functionality
3. Ensure `npm run build` and `npm test` both pass
4. Submit PR with a clear description of what changed and why

**Commit style:** `type(scope): description` (e.g. `feat(tools): add image_resize tool`)

---

## Release Process

1. Update version in `package.json`
2. Add entry to `CHANGELOG.md`
3. `git tag vX.Y.Z && git push --tags`
4. CI publishes to npm automatically on tag push

---

## Questions?

Open a GitHub Discussion or file an issue. We're happy to help!
