/**
 * Profile System — çoklu, tam izole agent örneği yönetimi.
 *
 *
 *
 * Her profil tam izole bir ortama sahiptir:
 *   ~/.cowrangler/profiles/<name>/config.yaml
 *   ~/.cowrangler/profiles/<name>/credentials.env
 *   ~/.cowrangler/profiles/<name>/skills/
 *   ~/.cowrangler/profiles/<name>/sessions.db
 *   ~/.cowrangler/profiles/<name>/memory.md
 *   ~/.cowrangler/profiles/<name>/cron.db
 *
 * Kullanım:
 *   cowrangler -p <profil>   → profil adıyla çalıştır
 *   COWRANGLER_PROFILE=coder cowrangler → env var ile
 *
 * Kural: Tüm yol referansları getProfileHome() üzerinden geçmeli.
 * Hiçbir zaman doğrudan ~/.cowrangler kullanılmamalı.
 */

import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";

const BASE_GLOBAL_DIR = path.join(os.homedir(), ".cowrangler");
const PROFILES_DIR = path.join(BASE_GLOBAL_DIR, "profiles");

// Aktif profil — main.ts'de applyProfileOverride() ile set edilir
let _activeProfile: string | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE OVERRIDE — tüm importlardan önce çağrılmalı
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aktif profili ayarla.
 * main.ts'de, herhangi bir modül import'undan önce çağrılmalıdır.
 */
export function applyProfileOverride(profileName: string): void {
  _activeProfile = profileName;
}

/**
 * Aktif profile göre global dizini döndürür.
 * Profil belirlenmemişse → ~/.cowrangler (varsayılan)
 * Profil belirlenmişse  → ~/.cowrangler/profiles/<name>
 */
export function getProfileHome(): string {
  if (!_activeProfile) return BASE_GLOBAL_DIR;
  return path.join(PROFILES_DIR, _activeProfile);
}

export function getActiveProfile(): string | null {
  return _activeProfile;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfileInfo {
  name: string;
  dir: string;
  model?: string;
  sessionCount?: number;
  createdAt?: number;
}

export function listProfiles(): ProfileInfo[] {
  if (!fs.existsSync(PROFILES_DIR)) return [];

  try {
    return fs
      .readdirSync(PROFILES_DIR)
      .filter((f) => fs.statSync(path.join(PROFILES_DIR, f)).isDirectory())
      .map((name) => {
        const dir = path.join(PROFILES_DIR, name);
        const configPath = path.join(dir, "config.yaml");
        let model: string | undefined;
        let createdAt: number | undefined;

        try {
          if (fs.existsSync(configPath)) {
            const cfg = yaml.load(fs.readFileSync(configPath, "utf-8")) as any;
            model = cfg?.model;
          }
          createdAt = fs.statSync(dir).birthtimeMs;
        } catch {
          /* sessizce */
        }

        return { name, dir, model, createdAt };
      });
  } catch {
    return [];
  }
}

export function createProfile(name: string, model?: string): ProfileInfo {
  const profileDir = path.join(PROFILES_DIR, name);

  if (fs.existsSync(profileDir)) {
    throw new Error(`Profile '${name}' already exists`);
  }

  // Dizin yapısını oluştur
  const subdirs = ["skills", "agents", "plugins"];
  fs.mkdirSync(profileDir, { recursive: true });
  for (const sub of subdirs) {
    fs.mkdirSync(path.join(profileDir, sub), { recursive: true });
  }

  // Varsayılan config
  const defaultConfig = {
    model: model ?? "openrouter/google/gemini-2.5-flash",
    temperature: 0.7,
    max_iterations: 25,
    view_mode: "default",
    permission_mode: "default",
    sandbox: { enabled: true },
  };

  fs.writeFileSync(
    path.join(profileDir, "config.yaml"),
    yaml.dump(defaultConfig),
    "utf-8",
  );

  // Boş credentials dosyası
  fs.writeFileSync(
    path.join(profileDir, "credentials.env"),
    `# Profile '${name}' API Keys\n`,
    "utf-8",
  );

  // Boş memory
  fs.writeFileSync(
    path.join(profileDir, "memory.md"),
    `# Project Memory — Profile: ${name}\n`,
    "utf-8",
  );

  return {
    name,
    dir: profileDir,
    model: defaultConfig.model,
    createdAt: Date.now(),
  };
}

export function deleteProfile(name: string): void {
  const profileDir = path.join(PROFILES_DIR, name);
  if (!fs.existsSync(profileDir)) {
    throw new Error(`Profile '${name}' not found`);
  }
  fs.rmSync(profileDir, { recursive: true, force: true });
}

export function profileExists(name: string): boolean {
  return fs.existsSync(path.join(PROFILES_DIR, name));
}

/**
 * Aktif profile ait paths — init.ts'teki DIRS'ı override eder.
 * Profil ayarlanmamışsa orijinal davranış korunur.
 */
export function getProfileDirs(profileHome: string) {
  return {
    base: profileHome,
    skills: path.join(profileHome, "skills"),
    agents: path.join(profileHome, "agents"),
    config: path.join(profileHome, "config.yaml"),
    credentials: path.join(profileHome, "credentials.env"),
    memory: path.join(profileHome, "memory.md"),
    sessionsDb: path.join(profileHome, "sessions.db"),
    cronDb: path.join(profileHome, "cron.db"),
  };
}

/**
 * CLI yardım metni — hangi profil aktif
 */
export function profileBanner(): string {
  if (!_activeProfile) return "";
  return ` [profile: ${_activeProfile}]`;
}
