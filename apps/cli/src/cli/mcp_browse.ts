/**
 * MCP Browse — cowrangler mcp browse
 *
 * Lists curated MCP servers in an interactive terminal UI.
 * When the user selects a server, it is automatically configured
 * and saved to ~/.cowrangler/config.yaml.
 *
 * Controls:
 *   ↑ / ↓       — navigate list
 *   ← / →       — switch category
 *   Enter / i   — install selected server
 *   /           — enter search mode
 *   q / Esc     — quit
 */

import readline from "readline";
import fs from "fs";
import { execSync, spawnSync } from "child_process";
import yaml from "js-yaml";
import chalk from "chalk";
import { DIRS } from "@cowrangler/core/init.js";
import { getSecrets } from "@cowrangler/core/credential_vault.js";

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace Data
// ─────────────────────────────────────────────────────────────────────────────

export interface McpServerEntry {
  id: string;           // key name in config.yaml
  name: string;         // display name
  category: Category;
  description: string;  // short description (list row)
  details: string;      // long description (detail panel)
  tools: string[];      // tools provided by the server
  package?: string;     // npm package (installed via npx)
  command?: string;     // custom command (if no package)
  args?: string[];      // command arguments ({{PLACEHOLDER}} templates supported)
  envVars?: Array<{     // required environment variables
    key: string;
    label: string;
    required: boolean;
    example?: string;
  }>;
  configArgs?: Array<{  // additional arguments collected from the user (directory path, etc.)
    key: string;
    label: string;
    default?: string;
    required: boolean;
  }>;
  stars?: string;       // popularity indicator (e.g. ★★★★☆)
  official?: boolean;   // official Anthropic/MCP package?
}

type Category =
  | "🗂  Files & Storage"
  | "🔍  Search & Web"
  | "💻  Development"
  | "🗄  Databases"
  | "💬  Messaging"
  | "🧠  AI & Memory"
  | "📝  Productivity";

const CATEGORIES: Category[] = [
  "🗂  Files & Storage",
  "🔍  Search & Web",
  "💻  Development",
  "🗄  Databases",
  "💬  Messaging",
  "🧠  AI & Memory",
  "📝  Productivity",
];

const REGISTRY: McpServerEntry[] = [
  // ── 🗂 Files & Storage ────────────────────────────────────────────────────
  {
    id: "filesystem",
    name: "Filesystem",
    category: "🗂  Files & Storage",
    description: "Read, write, and search the local file system",
    details:
      "Reads, writes, lists, and searches files. Works securely by restricting access to specified directories. You can make any directory accessible.",
    tools: ["read_file", "write_file", "list_directory", "search_files", "get_file_info"],
    package: "@modelcontextprotocol/server-filesystem",
    args: ["{{ALLOWED_DIR}}"],
    configArgs: [
      { key: "ALLOWED_DIR", label: "Directory to grant access to", default: process.env.HOME + "/Documents", required: true },
    ],
    stars: "★★★★★",
    official: true,
  },
  {
    id: "google-drive",
    name: "Google Drive",
    category: "🗂  Files & Storage",
    description: "Read and search files in Google Drive",
    details:
      "Reads, lists, and searches documents in Google Drive. Requires Google OAuth2 authentication.",
    tools: ["search_drive", "read_file", "list_files"],
    package: "@modelcontextprotocol/server-google-drive",
    envVars: [
      { key: "GDRIVE_CLIENT_ID", label: "Google OAuth Client ID", required: true },
      { key: "GDRIVE_CLIENT_SECRET", label: "Google OAuth Client Secret", required: true },
    ],
    stars: "★★★★☆",
    official: true,
  },
  {
    id: "s3",
    name: "AWS S3",
    category: "🗂  Files & Storage",
    description: "Read, write, and list files in S3 buckets",
    details:
      "Accesses Amazon S3 buckets. Reads, writes, lists, and deletes files. Requires AWS credentials.",
    tools: ["s3_get_object", "s3_put_object", "s3_list_objects", "s3_delete_object"],
    package: "mcp-server-aws-s3",
    envVars: [
      { key: "AWS_ACCESS_KEY_ID", label: "AWS Access Key ID", required: true },
      { key: "AWS_SECRET_ACCESS_KEY", label: "AWS Secret Access Key", required: true },
      { key: "AWS_REGION", label: "AWS Region", required: false, example: "us-east-1" },
    ],
    stars: "★★★☆☆",
  },

  // ── 🔍 Search & Web ─────────────────────────────────────────────────────────
  {
    id: "brave-search",
    name: "Brave Search",
    category: "🔍  Search & Web",
    description: "Web and news search via the Brave search engine",
    details:
      "Performs web search, news search, and local place search using the Brave Search API. Ad-free and privacy-focused.",
    tools: ["brave_web_search", "brave_news_search", "brave_local_search"],
    package: "@modelcontextprotocol/server-brave-search",
    envVars: [
      { key: "BRAVE_API_KEY", label: "Brave Search API Key", required: true, example: "BSA..." },
    ],
    stars: "★★★★★",
    official: true,
  },
  {
    id: "fetch",
    name: "Fetch",
    category: "🔍  Search & Web",
    description: "Fetch web page content and convert to Markdown",
    details:
      "Fetches any URL and converts its content to Markdown. Can use Playwright for JavaScript-heavy pages.",
    tools: ["fetch_url", "fetch_markdown"],
    package: "@modelcontextprotocol/server-fetch",
    stars: "★★★★★",
    official: true,
  },
  {
    id: "puppeteer",
    name: "Puppeteer",
    category: "🔍  Search & Web",
    description: "Browser automation — click, fill forms, take screenshots",
    details:
      "Provides full browser automation via headless Chrome. Supports form filling, clicking, taking screenshots, and running JavaScript.",
    tools: ["puppeteer_navigate", "puppeteer_click", "puppeteer_type", "puppeteer_screenshot", "puppeteer_evaluate"],
    package: "@modelcontextprotocol/server-puppeteer",
    stars: "★★★★☆",
    official: true,
  },
  {
    id: "perplexity",
    name: "Perplexity",
    category: "🔍  Search & Web",
    description: "Cited web search powered by Perplexity AI",
    details:
      "Performs cited, sourced web searches via the Perplexity AI API. Ideal for accessing up-to-date information.",
    tools: ["perplexity_search", "perplexity_ask"],
    package: "mcp-perplexity",
    envVars: [
      { key: "PERPLEXITY_API_KEY", label: "Perplexity API Key", required: true, example: "pplx-..." },
    ],
    stars: "★★★★☆",
  },

  // ── 💻 Development ──────────────────────────────────────────────────────────
  {
    id: "github",
    name: "GitHub",
    category: "💻  Development",
    description: "GitHub repo, PR, issue, and gist management",
    details:
      "Reads/writes repos, creates/reviews PRs, manages issues, searches code, and handles gists via the GitHub API.",
    tools: ["create_or_update_file", "search_repositories", "create_repository", "get_file_contents", "push_files", "create_issue", "create_pull_request", "search_code"],
    package: "@modelcontextprotocol/server-github",
    envVars: [
      { key: "GITHUB_PERSONAL_ACCESS_TOKEN", label: "GitHub Personal Access Token", required: true, example: "ghp_..." },
    ],
    stars: "★★★★★",
    official: true,
  },
  {
    id: "gitlab",
    name: "GitLab",
    category: "💻  Development",
    description: "GitLab repo, MR, pipeline, and issue management",
    details:
      "Manages projects, merge requests, pipelines, and CI/CD operations via the GitLab API.",
    tools: ["get_project", "list_merge_requests", "create_merge_request", "get_pipeline", "create_issue"],
    package: "@modelcontextprotocol/server-gitlab",
    envVars: [
      { key: "GITLAB_PERSONAL_ACCESS_TOKEN", label: "GitLab Personal Access Token", required: true, example: "glpat-..." },
      { key: "GITLAB_API_URL", label: "GitLab API URL (for self-hosted)", required: false, example: "https://gitlab.example.com/api/v4" },
    ],
    stars: "★★★★☆",
    official: true,
  },
  {
    id: "linear",
    name: "Linear",
    category: "💻  Development",
    description: "Issue, project, and sprint management in Linear",
    details:
      "Reads/writes issues, plans sprints, queries project status, and adds comments in Linear.",
    tools: ["linear_get_issues", "linear_create_issue", "linear_update_issue", "linear_list_projects"],
    package: "mcp-linear",
    envVars: [
      { key: "LINEAR_API_KEY", label: "Linear API Key", required: true, example: "lin_api_..." },
    ],
    stars: "★★★★☆",
  },
  {
    id: "jira",
    name: "Jira",
    category: "💻  Development",
    description: "Jira ticket, sprint, and project management",
    details:
      "Creates and updates tickets, manages sprints, and tracks project status via the Atlassian Jira API.",
    tools: ["jira_get_issue", "jira_create_issue", "jira_update_issue", "jira_search_issues"],
    package: "mcp-jira",
    envVars: [
      { key: "JIRA_HOST", label: "Jira Host URL", required: true, example: "https://your-org.atlassian.net" },
      { key: "JIRA_EMAIL", label: "Jira account email", required: true },
      { key: "JIRA_API_TOKEN", label: "Jira API Token", required: true },
    ],
    stars: "★★★☆☆",
  },

  // ── 🗄 Databases ───────────────────────────────────────────────────────────
  {
    id: "sqlite",
    name: "SQLite",
    category: "🗄  Databases",
    description: "Run queries against a SQLite database",
    details:
      "Runs SELECT, INSERT, UPDATE, DELETE queries against local SQLite files. Shows table schemas and statistics.",
    tools: ["read_query", "write_query", "create_table", "list_tables", "describe_table"],
    package: "@modelcontextprotocol/server-sqlite",
    configArgs: [
      { key: "DB_PATH", label: "SQLite database file path", default: "./db.sqlite", required: true },
    ],
    args: ["--db-path", "{{DB_PATH}}"],
    stars: "★★★★★",
    official: true,
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    category: "🗄  Databases",
    description: "Run queries against a PostgreSQL database",
    details:
      "Connects to a PostgreSQL database, retrieves table lists and schema info, and runs safe read-only queries.",
    tools: ["query", "list_tables", "describe_table"],
    package: "@modelcontextprotocol/server-postgres",
    envVars: [
      { key: "POSTGRES_CONNECTION_STRING", label: "PostgreSQL connection string", required: true, example: "postgresql://user:pass@localhost/dbname" },
    ],
    stars: "★★★★★",
    official: true,
  },
  {
    id: "mysql",
    name: "MySQL / MariaDB",
    category: "🗄  Databases",
    description: "Run queries against a MySQL database",
    details:
      "Connects to a MySQL or MariaDB database and runs queries. Works safely in read-only mode.",
    tools: ["query", "list_tables", "describe_table"],
    package: "mcp-server-mysql",
    envVars: [
      { key: "MYSQL_HOST", label: "MySQL Host", required: true, example: "localhost" },
      { key: "MYSQL_USER", label: "MySQL Username", required: true },
      { key: "MYSQL_PASSWORD", label: "MySQL Password", required: true },
      { key: "MYSQL_DATABASE", label: "Database Name", required: true },
    ],
    stars: "★★★☆☆",
  },

  // ── 💬 Messaging ────────────────────────────────────────────────────────────
  {
    id: "slack",
    name: "Slack",
    category: "💬  Messaging",
    description: "Send, read, and manage Slack messages and channels",
    details:
      "Connects to a Slack workspace. Sends/reads messages, lists channels, retrieves user info, and shares files.",
    tools: ["slack_post_message", "slack_get_channel_history", "slack_list_channels", "slack_get_users"],
    package: "@modelcontextprotocol/server-slack",
    envVars: [
      { key: "SLACK_BOT_TOKEN", label: "Slack Bot Token", required: true, example: "xoxb-..." },
      { key: "SLACK_TEAM_ID", label: "Slack Team ID", required: false, example: "T0123456" },
    ],
    stars: "★★★★★",
    official: true,
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "💬  Messaging",
    description: "Read and send emails via Gmail",
    details:
      "Reads, sends, searches emails, and manages labels via the Gmail API. Requires OAuth2 authentication.",
    tools: ["gmail_search", "gmail_read", "gmail_send", "gmail_reply", "gmail_list_labels"],
    package: "mcp-gmail",
    envVars: [
      { key: "GMAIL_CLIENT_ID", label: "Google OAuth Client ID", required: true },
      { key: "GMAIL_CLIENT_SECRET", label: "Google OAuth Client Secret", required: true },
    ],
    stars: "★★★★☆",
  },

  // ── 🧠 AI & Memory ─────────────────────────────────────────────────────────
  {
    id: "memory",
    name: "Memory (Knowledge Graph)",
    category: "🧠  AI & Memory",
    description: "Persistent knowledge graph — entity and relation management",
    details:
      "Provides persistent memory across sessions. Uses an entity, relation, and observation-based knowledge graph. Remembers user preferences and project context.",
    tools: ["create_entities", "create_relations", "add_observations", "search_nodes", "open_nodes"],
    package: "@modelcontextprotocol/server-memory",
    stars: "★★★★★",
    official: true,
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    category: "🧠  AI & Memory",
    description: "Structured step-by-step reasoning tool",
    details:
      "Breaks complex problems into structured thinking steps. Allows revision and branching. Improves reasoning quality on difficult tasks.",
    tools: ["sequentialthinking"],
    package: "@modelcontextprotocol/server-sequential-thinking",
    stars: "★★★★★",
    official: true,
  },
  {
    id: "obsidian",
    name: "Obsidian",
    category: "🧠  AI & Memory",
    description: "Read and write notes in your Obsidian vault",
    details:
      "Accesses an Obsidian vault. Reads, writes, searches notes, and tracks backlinks. Ideal for integrating with a personal knowledge base.",
    tools: ["read_note", "write_note", "search_notes", "list_notes", "get_backlinks"],
    package: "mcp-obsidian",
    configArgs: [
      { key: "VAULT_PATH", label: "Obsidian vault directory path", required: true },
    ],
    args: ["{{VAULT_PATH}}"],
    stars: "★★★★☆",
  },

  // ── 📝 Productivity ──────────────────────────────────────────────────────────
  {
    id: "notion",
    name: "Notion",
    category: "📝  Productivity",
    description: "Manage Notion pages, databases, and blocks",
    details:
      "Reads/writes pages, queries databases, adds blocks, and searches via the Notion API.",
    tools: ["notion_get_page", "notion_create_page", "notion_update_page", "notion_query_database", "notion_search"],
    package: "mcp-notion-server",
    envVars: [
      { key: "NOTION_API_TOKEN", label: "Notion Integration Token", required: true, example: "secret_..." },
    ],
    stars: "★★★★☆",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "📝  Productivity",
    description: "Read, create, and update calendar events",
    details:
      "Reads, creates, updates, and deletes events via the Google Calendar API. Multiple calendars are supported.",
    tools: ["list_events", "create_event", "update_event", "delete_event", "list_calendars"],
    package: "mcp-google-calendar",
    envVars: [
      { key: "GCAL_CLIENT_ID", label: "Google OAuth Client ID", required: true },
      { key: "GCAL_CLIENT_SECRET", label: "Google OAuth Client Secret", required: true },
    ],
    stars: "★★★★☆",
  },
  {
    id: "todoist",
    name: "Todoist",
    category: "📝  Productivity",
    description: "Todoist task and project management",
    details:
      "Creates and completes tasks, and manages projects and labels via the Todoist API.",
    tools: ["get_tasks", "create_task", "complete_task", "get_projects"],
    package: "mcp-todoist",
    envVars: [
      { key: "TODOIST_API_TOKEN", label: "Todoist API Token", required: true },
    ],
    stars: "★★★☆☆",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Config Helpers
// ─────────────────────────────────────────────────────────────────────────────

function loadConfig(): any {
  try {
    if (fs.existsSync(DIRS.global.config)) {
      return (yaml.load(fs.readFileSync(DIRS.global.config, "utf-8")) as any) || {};
    }
  } catch {}
  return {};
}

function saveConfig(cfg: any): void {
  fs.mkdirSync(DIRS.global.base, { recursive: true });
  fs.writeFileSync(DIRS.global.config, yaml.dump(cfg));
}

function isInstalled(serverId: string): boolean {
  const cfg = loadConfig();
  return !!(cfg.mcp_servers && cfg.mcp_servers[serverId]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Terminal Size
// ─────────────────────────────────────────────────────────────────────────────

function termSize(): { cols: number; rows: number } {
  return {
    cols: process.stdout.columns ?? 120,
    rows: process.stdout.rows ?? 30,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI Render
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT = "#FF4C00";
const DIM = "#555555";

function pad(str: string, len: number): string {
  const visible = str.replace(/\x1b\[[0-9;]*m/g, "");
  const diff = len - visible.length;
  return str + " ".repeat(Math.max(0, diff));
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + "…";
}

function renderScreen(
  state: BrowseState,
  searchMode: boolean,
  searchQuery: string,
): void {
  const { cols, rows } = termSize();
  const { selectedCategory, selectedIndex, scrollOffset } = state;

  // Clear screen
  process.stdout.write("\x1b[2J\x1b[H");

  const lines: string[] = [];

  // ── Title ───────────────────────────────────────────────────────────────
  const title = " ◆ Cowrangler MCP Marketplace ";
  const titlePad = Math.max(0, Math.floor((cols - title.length) / 2));
  lines.push(
    chalk.hex(ACCENT).bold(" ".repeat(titlePad) + title),
  );
  lines.push(chalk.dim("─".repeat(cols)));

  // ── Category tabs ────────────────────────────────────────────────────────
  const tabLine = CATEGORIES.map((cat, i) => {
    const isActive = !searchMode && i === selectedCategory;
    const short = cat.split("  ")[0]; // emoji + space only
    const label = ` ${short} `;
    return isActive
      ? chalk.hex(ACCENT).bold(`[${label}]`)
      : chalk.dim(`[${label}]`);
  }).join(" ");
  lines.push(" " + tabLine);
  lines.push(chalk.dim("─".repeat(cols)));

  // ── Content area: left list + right detail ───────────────────────────────
  const LIST_W = Math.floor(cols * 0.4);
  const DETAIL_W = cols - LIST_W - 3;

  // Servers to display
  const displayList = searchMode
    ? REGISTRY.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.category.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : REGISTRY.filter((s) => s.category === CATEGORIES[selectedCategory]);

  const selected = displayList[selectedIndex];

  // Left: list rows
  const VISIBLE_ROWS = rows - 10;
  const windowStart = Math.max(
    0,
    Math.min(selectedIndex - Math.floor(VISIBLE_ROWS / 2), displayList.length - VISIBLE_ROWS),
  );
  const visibleItems = displayList.slice(windowStart, windowStart + VISIBLE_ROWS);

  // Right: detail rows
  const detailLines: string[] = [];
  if (selected) {
    const installed = isInstalled(selected.id);

    detailLines.push(chalk.hex(ACCENT).bold(`  ${selected.name}`) + (selected.official ? chalk.hex("#34C759")(" ✦ official") : "") + (installed ? chalk.hex("#34C759")("  ✓ installed") : ""));
    detailLines.push(chalk.dim("  " + "─".repeat(DETAIL_W - 4)));
    detailLines.push("");

    // Description
    const descWords = selected.details.split(" ");
    let line = "  ";
    for (const word of descWords) {
      if (line.length + word.length > DETAIL_W - 2) {
        detailLines.push(chalk.dim(line));
        line = "  " + word + " ";
      } else {
        line += word + " ";
      }
    }
    if (line.trim()) detailLines.push(chalk.dim(line));
    detailLines.push("");

    // Stars
    if (selected.stars) {
      detailLines.push(`  ${chalk.yellow(selected.stars)}`);
    }

    // Tools
    detailLines.push("");
    detailLines.push(chalk.bold("  Tools:"));
    const toolChunks: string[] = [];
    let toolLine = "  ";
    for (const tool of selected.tools) {
      const chunk = chalk.dim(tool) + "  ";
      if (toolLine.replace(/\x1b\[[0-9;]*m/g, "").length + tool.length + 2 > DETAIL_W - 2) {
        toolChunks.push(toolLine);
        toolLine = "  " + chunk;
      } else {
        toolLine += chunk;
      }
    }
    if (toolLine.trim()) toolChunks.push(toolLine);
    detailLines.push(...toolChunks);

    // Env vars
    if (selected.envVars && selected.envVars.length > 0) {
      detailLines.push("");
      detailLines.push(chalk.bold("  Required env variables:"));
      for (const ev of selected.envVars) {
        const req = ev.required ? chalk.red(" *") : chalk.dim(" ?");
        const example = ev.example ? chalk.dim(`  (e.g. ${ev.example})`) : "";
        const hasKey = !!process.env[ev.key];
        const keyIcon = hasKey ? chalk.green("✓") : chalk.dim("○");
        detailLines.push(`  ${keyIcon} ${chalk.bold(ev.key)}${req}  ${chalk.dim(ev.label)}${example}`);
      }
    }

    // Package
    if (selected.package) {
      detailLines.push("");
      detailLines.push(chalk.bold("  Package:"));
      detailLines.push(`  ${chalk.dim("npx -y")} ${chalk.cyan(selected.package)}`);
    }

    detailLines.push("");
    detailLines.push(chalk.dim("─".repeat(DETAIL_W - 2)));
    if (installed) {
      detailLines.push(chalk.hex("#34C759")("  ✓ Already configured"));
      detailLines.push(chalk.dim("  Press Enter to reconfigure"));
    } else {
      detailLines.push(chalk.hex(ACCENT).bold("  Enter / i  →  Install & configure"));
    }
  } else {
    detailLines.push(chalk.dim("  Select a server"));
  }

  // Merge rows side-by-side
  const maxRows = Math.max(visibleItems.length, detailLines.length, VISIBLE_ROWS);

  for (let i = 0; i < maxRows; i++) {
    const leftEntry = visibleItems[i];
    let leftStr = "";

    if (leftEntry) {
      const realIdx = windowStart + i;
      const isSel = realIdx === selectedIndex;
      const inst = isInstalled(leftEntry.id);
      const instIcon = inst ? chalk.hex("#34C759")("✓") : " ";
      const prefix = isSel ? chalk.hex(ACCENT).bold(" ▶ ") : "   ";
      const name = truncate(leftEntry.name, 18);
      const desc = truncate(leftEntry.description, LIST_W - 24);

      leftStr = prefix +
        instIcon + " " +
        (isSel ? chalk.hex(ACCENT).bold(name) : chalk.white(name)) +
        "  " +
        chalk.dim(desc);
    }

    const rightStr = detailLines[i] || "";
    const leftPadded = pad(leftStr, LIST_W);
    const sep = chalk.dim("│");

    lines.push(leftPadded + sep + " " + rightStr);
  }

  // ── Bottom bar ───────────────────────────────────────────────────────────
  lines.push(chalk.dim("─".repeat(cols)));

  if (searchMode) {
    lines.push(
      chalk.cyan("  🔍 Search: ") +
      chalk.white(searchQuery) +
      chalk.hex(ACCENT)("█") +
      chalk.dim("   Esc → normal mode"),
    );
  } else {
    const count = displayList.length;
    const installed = REGISTRY.filter((s) => isInstalled(s.id)).length;
    lines.push(
      chalk.dim("  ↑↓ navigate  ·  ←→ category  ·  ") +
      chalk.hex(ACCENT).bold("Enter") +
      chalk.dim(" install  ·  ") +
      chalk.hex(ACCENT).bold("/") +
      chalk.dim(" search  ·  ") +
      chalk.hex(ACCENT).bold("q") +
      chalk.dim(" quit") +
      chalk.dim(`   ${count} servers · ${installed} installed`),
    );
  }

  process.stdout.write(lines.join("\n") + "\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Install Flow
// ─────────────────────────────────────────────────────────────────────────────

async function installServer(server: McpServerEntry): Promise<void> {
  // Exit raw mode
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdout.write("\x1b[2J\x1b[H");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = (q: string, def?: string): Promise<string> =>
    new Promise((resolve) => {
      const prompt = def ? `  ${q} ${chalk.dim(`[${def}]`)}: ` : `  ${q}: `;
      rl.question(prompt, (a) => resolve(a.trim() || def || ""));
    });

  console.log(chalk.hex(ACCENT).bold(`\n  ◆ Install ${server.name}\n`));
  if (server.official) console.log(chalk.hex("#34C759")("  ✦ Official Anthropic/MCP package\n"));
  console.log(chalk.dim(`  ${server.description}\n`));

  const envValues: Record<string, string> = {};
  const argValues: Record<string, string> = {};

  // Notify about env vars (Core redirection)
  if (server.envVars && server.envVars.length > 0) {
    console.log(chalk.bold("  API Keys & Environment Variables:"));
    const vaultSecrets = getSecrets(server.id);
    for (const ev of server.envVars) {
      const existing = process.env[ev.key] || vaultSecrets[ev.key];
      if (existing) {
        console.log(chalk.green(`  ✓ ${ev.key} (found in environment or Vault)`));
      } else {
        const hint = ev.example ? chalk.dim(` (e.g. ${ev.example})`) : "";
        const req = ev.required ? chalk.red(" *required") : chalk.dim(" (optional)");
        console.log(`  ○ ${chalk.bold(ev.key)}${req}${hint}`);
      }
    }
    console.log(chalk.dim("\n  Note: API keys are now managed securely via the Cowrangler Desktop UI."));
    console.log(chalk.dim("  Please configure them in 'Settings → Extensions' if not already set.\n"));
  }

  // Collect config args
  if (server.configArgs && server.configArgs.length > 0) {
    console.log(chalk.bold("  Configuration Parameters:\n"));
    for (const ca of server.configArgs) {
      console.log(chalk.dim(`  ${ca.label}:`));
      const val = await ask("  Value", ca.default);
      argValues[ca.key] = val;
      console.log();
    }
  }

  // Fill in template placeholders in args
  const resolvedArgs = (server.args || []).map((arg) =>
    arg.replace(/\{\{(\w+)\}\}/g, (_, key) => argValues[key] || arg),
  );

  // Build config object
  const serverConfig: any = {};
  if (server.package) {
    serverConfig.command = "npx";
    serverConfig.args = ["-y", server.package, ...resolvedArgs].filter(Boolean);
  } else if (server.command) {
    serverConfig.command = server.command;
    if (resolvedArgs.length) serverConfig.args = resolvedArgs;
  }
  if (Object.keys(envValues).length > 0) {
    serverConfig.env = envValues;
  }
  serverConfig.timeout = 120;

  // Connection test (optional — package may need to be downloaded first)
  console.log(chalk.cyan("  Testing connection..."));
  let testOk = false;
  try {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
    if (serverConfig.command) {
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args || [],
        env: { ...process.env, ...serverConfig.env },
      });
      const client = new Client({ name: "cowrangler-test", version: "2.0.8" }, { capabilities: {} });
      const connectPromise = client.connect(transport);
      const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000));
      await Promise.race([connectPromise, timeout]);
      const toolsList = await client.listTools();
      await client.close();
      console.log(chalk.green(`  ✓ Connection successful — ${toolsList.tools.length} tools found`));
      testOk = true;
    }
  } catch {
    console.log(chalk.yellow("  ⚠ Connection test failed (package may not be downloaded yet — it will be fetched on first run)"));
  }

  // Save to config
  const cfg = loadConfig();
  if (!cfg.mcp_servers) cfg.mcp_servers = {};
  cfg.mcp_servers[server.id] = serverConfig;

  // Credential.env generation removed in favor of CredentialVault.

  saveConfig(cfg);

  console.log(chalk.green(`\n  ✓ '${server.name}' configured successfully!\n`));
  console.log(chalk.dim("  It will connect automatically on the next cowrangler session."));
  console.log(chalk.dim("  Check status: /mcp (inside a session)\n"));

  rl.close();

  // Return to raw mode — continue browsing
  process.stdin.setRawMode(true);
  process.stdin.resume();

  await new Promise((r) => setTimeout(r, 1500));
}

// ─────────────────────────────────────────────────────────────────────────────
// State & Main Loop
// ─────────────────────────────────────────────────────────────────────────────

interface BrowseState {
  selectedCategory: number;
  selectedIndex: number;
  scrollOffset: number;
}

export async function runMcpBrowse(): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error(chalk.red("\n  ✗ This command requires an interactive terminal.\n"));
    return;
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  const state: BrowseState = { selectedCategory: 0, selectedIndex: 0, scrollOffset: 0 };
  let searchMode = false;
  let searchQuery = "";

  const currentList = () =>
    searchMode
      ? REGISTRY.filter(
          (s) =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.category.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : REGISTRY.filter((s) => s.category === CATEGORIES[state.selectedCategory]);

  renderScreen(state, searchMode, searchQuery);

  return new Promise((resolve) => {
    const handleKey = async (str: string, key: any) => {
      // Quit
      if ((!searchMode && (str === "q" || str === "Q")) || (key.ctrl && key.name === "c")) {
        process.stdin.removeListener("keypress", handleKey);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write("\x1b[2J\x1b[H");
        resolve();
        return;
      }

      if (!searchMode) {
        if (key.name === "escape") {
          // Already in normal mode
        } else if (str === "/") {
          // Enter search mode
          searchMode = true;
          searchQuery = "";
          state.selectedIndex = 0;
          renderScreen(state, searchMode, searchQuery);
          return;
        } else if (key.name === "left") {
          state.selectedCategory = Math.max(0, state.selectedCategory - 1);
          state.selectedIndex = 0;
          renderScreen(state, searchMode, searchQuery);
          return;
        } else if (key.name === "right") {
          state.selectedCategory = Math.min(CATEGORIES.length - 1, state.selectedCategory + 1);
          state.selectedIndex = 0;
          renderScreen(state, searchMode, searchQuery);
          return;
        } else if (key.name === "up") {
          state.selectedIndex = Math.max(0, state.selectedIndex - 1);
          renderScreen(state, searchMode, searchQuery);
          return;
        } else if (key.name === "down") {
          const list = currentList();
          state.selectedIndex = Math.min(list.length - 1, state.selectedIndex + 1);
          renderScreen(state, searchMode, searchQuery);
          return;
        } else if (key.name === "return" || str === "i" || str === "I") {
          const list = currentList();
          const server = list[state.selectedIndex];
          if (server) {
            process.stdin.removeListener("keypress", handleKey);
            await installServer(server);
            // Re-attach listener
            process.stdin.on("keypress", handleKey);
            renderScreen(state, searchMode, searchQuery);
          }
          return;
        }
      } else {
        // Search mode
        if (key.name === "escape") {
          searchMode = false;
          searchQuery = "";
          state.selectedIndex = 0;
          renderScreen(state, searchMode, searchQuery);
          return;
        } else if (key.name === "return") {
          // Exit search mode and install selection
          const list = currentList();
          const server = list[state.selectedIndex];
          if (server) {
            searchMode = false;
            process.stdin.removeListener("keypress", handleKey);
            await installServer(server);
            process.stdin.on("keypress", handleKey);
            renderScreen(state, searchMode, searchQuery);
          }
          return;
        } else if (key.name === "up") {
          state.selectedIndex = Math.max(0, state.selectedIndex - 1);
          renderScreen(state, searchMode, searchQuery);
          return;
        } else if (key.name === "down") {
          const list = currentList();
          state.selectedIndex = Math.min(list.length - 1, state.selectedIndex + 1);
          renderScreen(state, searchMode, searchQuery);
          return;
        } else if (key.name === "backspace") {
          searchQuery = searchQuery.slice(0, -1);
          state.selectedIndex = 0;
          renderScreen(state, searchMode, searchQuery);
          return;
        } else if (str && !key.ctrl && !key.meta && str.length === 1) {
          searchQuery += str;
          state.selectedIndex = 0;
          renderScreen(state, searchMode, searchQuery);
          return;
        }
      }
    };

    process.stdin.on("keypress", handleKey);

    // Resize support
    process.stdout.on("resize", () => {
      renderScreen(state, searchMode, searchQuery);
    });
  });
}
