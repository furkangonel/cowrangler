---
name: obsidian
description: Obsidian vault management — create notes, backlinks, tags, and Dataview queries via file operations
platforms: [linux, macos, windows]
tags: [obsidian, notes, knowledge-management, zettelkasten, markdown, dataview]
---

# Obsidian Vault Management

## Goal
Create, update, and organize notes in an Obsidian vault programmatically. Query notes with Dataview syntax. Maintain a consistent vault structure.

## Vault Structure

```
vault/
├── Daily Notes/          # YYYY-MM-DD.md
├── Projects/             # One folder per project
├── Areas/                # Ongoing responsibilities
├── Resources/            # Reference material
├── Archive/              # Inactive notes
└── _templates/           # Note templates
```

Use PARA method (Projects / Areas / Resources / Archive) as the default organization.

## Frontmatter Conventions

Every note should have frontmatter:

```yaml
---
title: Note Title
date: 2024-01-15
tags: [topic, subtopic]
aliases: [alternative-name]
status: draft | active | archived
related: [[Other Note]], [[Another Note]]
---
```

- `date`: ISO 8601 (YYYY-MM-DD)
- `tags`: lowercase, hyphenated
- `aliases`: alternate names for search/linking
- `status`: lifecycle state
- `related`: explicit links (supplement to inline wikilinks)

## Creating Notes Programmatically

### Basic note creation
```python
from pathlib import Path
from datetime import datetime

def create_note(vault_path: str, folder: str, title: str, content: str, tags: list[str] = []) -> Path:
    vault = Path(vault_path)
    target_dir = vault / folder
    target_dir.mkdir(parents=True, exist_ok=True)
    
    # Sanitize title for filename
    filename = title.replace("/", "-").replace(":", "-") + ".md"
    note_path = target_dir / filename
    
    frontmatter = f"""---
title: {title}
date: {datetime.now().strftime("%Y-%m-%d")}
tags: {tags}
---

"""
    note_path.write_text(frontmatter + content, encoding="utf-8")
    return note_path
```

### Daily note
```python
def create_daily_note(vault_path: str, template: str = "") -> Path:
    today = datetime.now().strftime("%Y-%m-%d")
    content = template or f"""# {today}

## Tasks
- [ ] 

## Notes

## Links
"""
    return create_note(vault_path, "Daily Notes", today, content)
```

## Wikilink Syntax

```markdown
[[Note Title]]                    # Basic link
[[Note Title|Display Text]]       # Link with alias
[[Note Title#Heading]]            # Link to section
![[Note Title]]                   # Embed note
![[image.png]]                    # Embed image
```

### Adding backlinks programmatically
```python
def add_backlink(note_path: str, linked_title: str):
    path = Path(note_path)
    content = path.read_text(encoding="utf-8")
    link = f"[[{linked_title}]]"
    if link not in content:
        content += f"\n\n## Related\n{link}\n"
        path.write_text(content, encoding="utf-8")
```

## Tag Management

```python
import re

def add_tags(note_path: str, new_tags: list[str]):
    path = Path(note_path)
    content = path.read_text(encoding="utf-8")
    
    # Find existing tags in frontmatter
    match = re.search(r'^tags:\s*\[([^\]]*)\]', content, re.MULTILINE)
    if match:
        existing = [t.strip() for t in match.group(1).split(",") if t.strip()]
        merged = list(set(existing + new_tags))
        content = content[:match.start()] + f"tags: {merged}" + content[match.end():]
        path.write_text(content, encoding="utf-8")

def find_notes_by_tag(vault_path: str, tag: str) -> list[Path]:
    vault = Path(vault_path)
    results = []
    for md in vault.rglob("*.md"):
        if f"#{tag}" in md.read_text() or f'"{tag}"' in md.read_text():
            results.append(md)
    return results
```

## Dataview Queries

Dataview plugin queries (placed inside `dataview` code blocks in notes):

### List notes by tag
````markdown
```dataview
LIST
FROM #project
SORT date DESC
```
````

### Table of tasks
````markdown
```dataview
TABLE date, status, tags
FROM "Projects"
WHERE status != "archived"
SORT date DESC
```
````

### Incomplete tasks across vault
````markdown
```dataview
TASK
WHERE !completed
FROM "Projects"
GROUP BY file.link
```
````

### Notes modified this week
````markdown
```dataview
LIST
WHERE file.mtime >= date(today) - dur(7 days)
SORT file.mtime DESC
```
````

## Search and Query (CLI)

```bash
# Find all notes containing a phrase
grep -rl "search term" /path/to/vault --include="*.md"

# Find broken wikilinks (links with no matching file)
python3 << 'EOF'
from pathlib import Path
import re

vault = Path("/path/to/vault")
all_titles = {p.stem for p in vault.rglob("*.md")}
wikilink_pattern = re.compile(r'\[\[([^\]|#]+)')

for note in vault.rglob("*.md"):
    content = note.read_text()
    for link in wikilink_pattern.findall(content):
        if link.strip() not in all_titles:
            print(f"Broken link in {note.name}: [[{link}]]")
EOF
```

## Templates

### Meeting note template
```markdown
---
title: Meeting — {{title}}
date: {{date}}
tags: [meeting]
attendees: []
---

# {{title}}

**Date**: {{date}}  
**Attendees**: 

## Agenda
1. 

## Notes

## Action Items
- [ ] 

## Decisions

```

### Project note template
```markdown
---
title: {{project-name}}
date: {{date}}
tags: [project]
status: active
deadline: 
---

# {{project-name}}

## Goal

## Success Criteria
- [ ] 

## Tasks
- [ ] 

## Notes

## Related
```

## Folder Organization Patterns

| Content Type | Location | Naming |
|---|---|---|
| Daily notes | `Daily Notes/` | `YYYY-MM-DD.md` |
| Meeting notes | `Areas/Meetings/` | `YYYY-MM-DD Topic.md` |
| Project notes | `Projects/{name}/` | `README.md` + sub-notes |
| Reference | `Resources/{topic}/` | Descriptive title |
| Permanent notes | `Resources/Zettelkasten/` | ID + title |

## Common Pitfalls

- **Spaces in filenames**: Obsidian handles them, but some plugins prefer hyphens
- **Nested tags**: Use `#category/subcategory` syntax for hierarchy
- **Sync conflicts**: Prefer iCloud or Obsidian Sync over Dropbox for vault sync
- **Large vaults**: Limit graph view for vaults >5000 notes; use search instead
