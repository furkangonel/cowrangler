/**
 * context_scopes — Context katmanının TEK kanonik kaynağı.
 *
 * Görseldeki "Context" kutusunu kodda merkezileştirir: Skills / Agents / Memory /
 * Instructions öğelerinin global / proje / session yollarını ve öncelik (precedence)
 * kurallarını tek yerden verir. Her yüzey (CLI/Cowork/Design/Code) scope'ları aynı
 * şekilde çözsün diye discovery kodları buradan beslenir.
 *
 * Precedence (düşük → yüksek, yüksek olan ezer):
 *   bundled < global < project < session
 *
 * Kanonik yerleşim (session katmanı = global proje deposu <store> =
 * ~/.cowrangler/projects/<label>-<hash>/; proje dizinini kirletmez):
 *   Skills        global   ~/.cowrangler/skills/
 *                 project  {workdir}/.cowrangler/skills/
 *                 session  <store>/context/skills/<sessionId>/
 *   Agents        global   ~/.cowrangler/agents/
 *                 project  {workdir}/.cowrangler/agents/
 *                 session  <store>/context/agents/<sessionId>/
 *   Memory        global   ~/.cowrangler/memory.md
 *                 project  {workdir}/.cowrangler/memory/
 *                 session  <store>/context/memory/<sessionId>.md
 *   Instructions  project  {workdir}/COWRNGLR.md
 */

import path from "path";
import { DIRS } from "./init.js";
import {
  getProjectWorkdir,
  getProjectLocalSkillsDir,
  getProjectContextSkillsDir,
  getProjectContextAgentsDir,
  getProjectMemoryDir,
  getProjectSessionMemoryFile,
  getProjectCowrnglrMd,
} from "./project_context.js";

export type ContextKind = "skills" | "agents" | "memory" | "instructions";
export type Scope = "global" | "project" | "session";

export interface ScopePaths {
  /** ~/.cowrangler altındaki global yol (varsa). */
  global?: string;
  /** {workdir}/.cowrangler altındaki proje yolu (varsa). */
  project?: string;
  /** {workdir}/.cowrangler/context altındaki session yolu (varsa). */
  session?: string;
}

/** Öncelik sırası — düşükten yükseğe. Discovery bu sırada merge etmeli. */
export const SCOPE_PRECEDENCE: Scope[] = ["global", "project", "session"];

function projectAgentsDir(): string {
  return path.join(getProjectWorkdir(), ".cowrangler", "agents");
}

/** Bir context öğesinin global/proje/session yollarını verir. */
export function getScopePaths(kind: ContextKind, sessionId?: string): ScopePaths {
  switch (kind) {
    case "skills":
      return {
        global: DIRS.global.skills,
        project: getProjectLocalSkillsDir(),
        session: getProjectContextSkillsDir(sessionId),
      };
    case "agents":
      return {
        global: DIRS.global.agents,
        project: projectAgentsDir(),
        session: getProjectContextAgentsDir(sessionId),
      };
    case "memory":
      return {
        global: DIRS.global.memory,
        project: getProjectMemoryDir(),
        session: getProjectSessionMemoryFile(sessionId),
      };
    case "instructions":
      return {
        project: getProjectCowrnglrMd(),
      };
  }
}

/** Bir öğenin dolu scope'larını precedence sırasında (global→session) döndürür. */
export function orderedScopePaths(kind: ContextKind, sessionId?: string): Array<{ scope: Scope; path: string }> {
  const paths = getScopePaths(kind, sessionId);
  const out: Array<{ scope: Scope; path: string }> = [];
  for (const scope of SCOPE_PRECEDENCE) {
    const p = paths[scope];
    if (p) out.push({ scope, path: p });
  }
  return out;
}

/** UI/doküman için tüm context haritası (aktif workdir + session'a göre). */
export function describeContextScopes(sessionId?: string): Record<ContextKind, ScopePaths> {
  return {
    skills: getScopePaths("skills", sessionId),
    agents: getScopePaths("agents", sessionId),
    memory: getScopePaths("memory", sessionId),
    instructions: getScopePaths("instructions", sessionId),
  };
}
