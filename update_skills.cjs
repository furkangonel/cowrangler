const fs = require('fs');
const path = require('path');

const skillsDir = path.join(__dirname, 'src/bundled_skills');
const skills = fs.readdirSync(skillsDir).filter(dir => {
  const stat = fs.statSync(path.join(skillsDir, dir));
  return stat.isDirectory();
});

let updated = 0;

for (const skill of skills) {
  const mdPath = path.join(skillsDir, skill, 'SKILL.md');
  if (!fs.existsSync(mdPath)) continue;

  let content = fs.readFileSync(mdPath, 'utf-8');

  // Parse frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) continue;

  let frontmatter = frontmatterMatch[1];
  let body = content.slice(frontmatterMatch[0].length);

  let modifiedFrontmatter = false;
  let modifiedBody = false;

  // Update frontmatter description if needed
  if (!frontmatter.includes('Trigger for:')) {
    // Find description block and append
    // Note: description can be a multi-line string in YAML (using | or >)
    // We'll just do a simple string replace or append
    if (frontmatter.includes('description: |')) {
      frontmatter = frontmatter.replace(/description: \|([\s\S]*?)(?=\n[a-z]+:|$)/, (match, desc) => {
        return `description: |${desc}\n  \n  Trigger for:\n  - [TODO: Add specific triggers for when to use this skill]\n  \n  Don't trigger for:\n  - [TODO: Add anti-triggers for when NOT to use this skill]`;
      });
      modifiedFrontmatter = true;
    } else if (frontmatter.includes('description: "')) {
      // It's a quoted string, convert to multi-line
      frontmatter = frontmatter.replace(/description: "(.*?)"/, `description: |\n  $1\n  \n  Trigger for:\n  - [TODO: Add specific triggers for when to use this skill]\n  \n  Don't trigger for:\n  - [TODO: Add anti-triggers for when NOT to use this skill]`);
      modifiedFrontmatter = true;
    }
  }

  // Update body with missing sections
  if (!body.includes('## Why/Failure Modes')) {
    body += `\n\n## Why/Failure Modes\n\n[TODO: Explain the reasoning behind this skill's approach and common failure modes to avoid.]`;
    modifiedBody = true;
  }
  
  if (!body.includes('## Standalone vs Supercharged')) {
    body += `\n\n## Standalone vs Supercharged\n\n[TODO: Describe how this skill works on its own vs when combined with other tools/context.]`;
    modifiedBody = true;
  }
  
  if (!body.includes('## Cross-References')) {
    body += `\n\n## Cross-References\n\n[TODO: Link to other relevant skills or documentation.]`;
    modifiedBody = true;
  }

  if (modifiedFrontmatter || modifiedBody) {
    const newContent = `---\n${frontmatter}\n---${body}`;
    fs.writeFileSync(mdPath, newContent, 'utf-8');
    updated++;
  }
}

console.log(`Updated ${updated} skill files.`);
