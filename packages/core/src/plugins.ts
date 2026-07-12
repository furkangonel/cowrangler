import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { DIRS, getConfig } from "./init.js";
import { getProjectWorkdir } from "./project_context.js";
import { registerTool, unregisterTool } from "./tools/registry.js";
import { SUB_AGENTS } from "./subagents.js";
import { ModelMeta, registerDynamicModel, unregisterDynamicModel } from "./model_metadata.js";

export interface PluginDef {
  id: string;
  name: string;
  version: string;
  description: string;
  source: "global" | "local";
  dir: string;
}

export interface ProviderInterceptor {
  apiKey?: string;
  fetch?: (input: any, init?: any) => Promise<any>;
  headers?: Record<string, string>;
  /**
   * Optional readiness probe. When present, the host uses it to decide whether
   * models served by this provider are usable yet (e.g. OAuth login done).
   * `actionId` points at a plugin action that resolves the gate (e.g. "login").
   */
  status?: () => Promise<ProviderStatus> | ProviderStatus;
}

export interface ProviderStatus {
  ready: boolean;
  reason?: string;
  actionId?: string;
}

/** A user-triggerable action a plugin exposes (e.g. "Sign in"). */
export interface PluginActionRunContext {
  /** Open a URL in the user's default browser (host-provided). */
  openUrl: (url: string) => Promise<void> | void;
  /** Emit a status/log line back to the host UI. */
  log: (message: string) => void;
}

export interface PluginActionResult {
  ok: boolean;
  message?: string;
}

export interface PluginAction {
  id: string;
  title: string;
  description?: string;
  /** Optional lucide icon name the UI may render. */
  icon?: string;
  run: (ctx: PluginActionRunContext) => Promise<PluginActionResult> | PluginActionResult;
}

/** Serializable metadata about a plugin action (safe to send over IPC). */
export interface PluginActionMeta {
  id: string;
  title: string;
  description?: string;
  icon?: string;
}

/** What a plugin registered during setup() — used for UI badges. */
export interface PluginContribution {
  models: string[];
  skills: number;
  tools: number;
  providers: string[];
  actions: PluginActionMeta[];
}

/** Per-model gate state derived from provider readiness. */
export interface PluginModelGate {
  locked: boolean;
  reason?: string;
  pluginId: string;
  actionId?: string;
}

export interface PluginContext {
  pluginDir: string;
  config: any;
  registerTool: (name: string, description: string, parameters: any, execute: Function) => void;
  registerSubAgent: (name: string, definition: any) => void;
  registerSkillPath: (dirPath: string) => void;
  registerModel: (modelId: string, metadata: ModelMeta) => void;
  registerProviderInterceptor: (providerId: string, interceptor: ProviderInterceptor) => void;
  registerAction: (action: PluginAction) => void;
}

export class PluginManager {
  private static instance: PluginManager;
  private pluginSkillPaths: string[] = [];
  private interceptors = new Map<string, ProviderInterceptor>();
  private pluginActions = new Map<string, PluginAction[]>();
  private pluginContribs = new Map<string, PluginContribution>();
  /** providerId -> pluginId that registered its interceptor */
  private providerOwner = new Map<string, string>();
  /** pluginId -> tool names registered by that plugin */
  private pluginRegisteredTools = new Map<string, string[]>();
  /** pluginId -> subagent names registered by that plugin */
  private pluginRegisteredSubAgents = new Map<string, string[]>();

  private constructor() {}

  public static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  public registerProviderInterceptor(providerId: string, interceptor: ProviderInterceptor) {
    this.interceptors.set(providerId, interceptor);
  }

  public getProviderInterceptor(providerId: string): ProviderInterceptor | undefined {
    return this.interceptors.get(providerId);
  }

  /**
   * DEPRECATED yerleşim — plugin'ler artık yalnızca global tutulur. Bu yol yalnızca
   * eski, proje-lokal plugin artıklarını tespit/tarama (ve migration) içindir.
   * process.cwd() yerine AKTİF workdir'i kullanır (desktop'ta doğru proje).
   */
  public getLocalPluginsDir(): string {
    return path.join(getProjectWorkdir(), ".cowrangler", "plugins");
  }

  public getGlobalPluginsDir(): string {
    return path.join(DIRS.global.base, "plugins");
  }

  private loadPluginsFromDir(dirPath: string, source: "global" | "local"): PluginDef[] {
    const list: PluginDef[] = [];
    if (!fs.existsSync(dirPath)) return list;

    try {
      const items = fs.readdirSync(dirPath);
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        if (!fs.statSync(itemPath).isDirectory()) continue;

        const manifestPath = path.join(itemPath, "plugin.json");
        if (!fs.existsSync(manifestPath)) continue;

        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          const id = manifest.id || item;
          list.push({
            id,
            name: manifest.name || id,
            version: manifest.version || "1.0.0",
            description: manifest.description || "No description.",
            source,
            dir: itemPath,
          });
        } catch (e) {
          console.error(`Failed to parse plugin.json for ${item}:`, e);
        }
      }
    } catch (e) {
      console.error(`Failed to read plugin directory ${dirPath}:`, e);
    }
    return list;
  }

  public getAvailablePlugins(): PluginDef[] {
    const merged = new Map<string, PluginDef>();
    
    // Global plugins (lower priority)
    this.loadPluginsFromDir(this.getGlobalPluginsDir(), "global").forEach(p => merged.set(p.id, p));
    
    // Local plugins (higher priority)
    this.loadPluginsFromDir(this.getLocalPluginsDir(), "local").forEach(p => merged.set(p.id, p));

    return Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  public async initializeAll(): Promise<void> {
    const plugins = this.getAvailablePlugins();
    const config = getConfig();

    // ── Full reset of all plugin-contributed state ──────────────────────────
    // 1. Remove previously registered plugin tools from the global TOOL_SCHEMAS.
    for (const [, toolNames] of this.pluginRegisteredTools) {
      for (const name of toolNames) unregisterTool(name);
    }
    this.pluginRegisteredTools.clear();

    // 2. Remove previously registered plugin subagents from SUB_AGENTS.
    for (const [, agentNames] of this.pluginRegisteredSubAgents) {
      for (const name of agentNames) delete SUB_AGENTS[name];
    }
    this.pluginRegisteredSubAgents.clear();

    // 3. Remove previously registered dynamic models from MODEL_REGISTRY.
    for (const [, contrib] of this.pluginContribs) {
      for (const modelId of contrib.models) unregisterDynamicModel(modelId);
    }

    // 4. Clear provider interceptors so stale plugin fetchers don't linger.
    this.interceptors.clear();

    // 5. Clear skill paths — will be re-populated by active plugins below.
    this.pluginSkillPaths = [];

    // 6. Clear remaining per-plugin bookkeeping maps.
    this.pluginActions.clear();
    this.pluginContribs.clear();
    this.providerOwner.clear();
    // ────────────────────────────────────────────────────────────────────────

    for (const plugin of plugins) {
      const indexJs = path.join(plugin.dir, "index.js");
      if (!fs.existsSync(indexJs)) continue;

      // Fresh contribution record for this plugin.
      const contrib: PluginContribution = { models: [], skills: 0, tools: 0, providers: [], actions: [] };
      this.pluginContribs.set(plugin.id, contrib);
      this.pluginActions.set(plugin.id, []);
      this.pluginRegisteredTools.set(plugin.id, []);
      this.pluginRegisteredSubAgents.set(plugin.id, []);

      try {
        const mod = await import(`file://${indexJs}`);
        if (typeof mod.setup === "function") {
          const ctx: PluginContext = {
            pluginDir: plugin.dir,
            config,
            registerTool: (name, description, parameters, execute) => {
              registerTool(name, description, parameters, execute);
              contrib.tools++;
              this.pluginRegisteredTools.get(plugin.id)!.push(name);
            },
            registerSubAgent: (name, definition) => {
              SUB_AGENTS[name] = definition;
              this.pluginRegisteredSubAgents.get(plugin.id)!.push(name);
            },
            registerSkillPath: (dirPath) => {
              this.registerSkillPath(dirPath);
              contrib.skills++;
            },
            registerModel: (modelId, metadata) => {
              registerDynamicModel(modelId, metadata);
              contrib.models.push(modelId);
            },
            registerProviderInterceptor: (providerId, interceptor) => {
              this.registerProviderInterceptor(providerId, interceptor);
              this.providerOwner.set(providerId, plugin.id);
              if (!contrib.providers.includes(providerId)) contrib.providers.push(providerId);
            },
            registerAction: (action) => {
              const list = this.pluginActions.get(plugin.id)!;
              // Replace any existing action with the same id (idempotent re-init).
              const idx = list.findIndex((a) => a.id === action.id);
              if (idx >= 0) list[idx] = action;
              else list.push(action);
              contrib.actions = list.map((a) => ({ id: a.id, title: a.title, description: a.description, icon: a.icon }));
            },
          };
          await mod.setup(ctx);
        }
      } catch (e) {
        console.error(`Error loading plugin ${plugin.name} (${plugin.id}):`, e);
      }
    }
  }

  /** Serializable contribution summary for a plugin (for UI badges). */
  public getPluginContribution(id: string): PluginContribution | undefined {
    return this.pluginContribs.get(id);
  }

  /**
   * All model ids contributed by installed plugins (deduped). Used by the
   * desktop + CLI model pickers to surface plugin models alongside the user's
   * saved models, so they are discoverable after install without manual entry.
   */
  public getPluginModels(): string[] {
    const out = new Set<string>();
    for (const contrib of this.pluginContribs.values()) {
      for (const m of contrib.models) out.add(m);
    }
    return Array.from(out);
  }

  /** Serializable action metadata for a plugin. */
  public getPluginActionMetas(id: string): PluginActionMeta[] {
    return (this.pluginActions.get(id) || []).map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      icon: a.icon,
    }));
  }

  /** Run a plugin action by id. Host supplies openUrl/log. */
  public async runAction(
    pluginId: string,
    actionId: string,
    host: PluginActionRunContext,
  ): Promise<PluginActionResult> {
    const action = (this.pluginActions.get(pluginId) || []).find((a) => a.id === actionId);
    if (!action) {
      return { ok: false, message: `Action "${actionId}" not found on plugin "${pluginId}".` };
    }
    try {
      return await action.run(host);
    } catch (e: any) {
      return { ok: false, message: e?.message || String(e) };
    }
  }

  /**
   * Compute per-model gate state by probing each provider interceptor's
   * optional status(). Models whose provider is not ready are marked locked,
   * pointing at the plugin action that resolves the gate.
   */
  public async getModelGates(): Promise<Record<string, PluginModelGate>> {
    const gates: Record<string, PluginModelGate> = {};
    for (const [pluginId, contrib] of this.pluginContribs.entries()) {
      if (contrib.models.length === 0) continue;
      // Find the first provider (owned by this plugin) that exposes a status probe.
      let status: ProviderStatus | undefined;
      for (const providerId of contrib.providers) {
        const interceptor = this.interceptors.get(providerId);
        if (interceptor?.status) {
          try {
            status = await interceptor.status();
          } catch {
            status = { ready: false, reason: "Status check failed" };
          }
          break;
        }
      }
      if (!status || status.ready) continue;
      const actionId = status.actionId
        || (this.pluginActions.get(pluginId) || [])[0]?.id;
      for (const modelId of contrib.models) {
        gates[modelId] = {
          locked: true,
          reason: status.reason,
          pluginId,
          actionId,
        };
      }
    }
    return gates;
  }

  public registerSkillPath(p: string) {
    if (!this.pluginSkillPaths.includes(p)) {
      this.pluginSkillPaths.push(p);
    }
  }

  public getPluginSkillPaths(): string[] {
    return this.pluginSkillPaths;
  }

  public async installPlugin(
    sourcePathOrUrl: string,
    options: { global?: boolean } = {}
  ): Promise<{ ok: boolean; error?: string; id?: string }> {
    // Plugin'ler makine-geneli bir kaynaktır → VARSAYILAN GLOBAL. Proje dizinine
    // asla klonlanmaz. `global: false` yalnızca bilinçli opt-in (nadir) içindir.
    const isGlobal = options.global ?? true;
    const destParent = isGlobal ? this.getGlobalPluginsDir() : this.getLocalPluginsDir();
    fs.mkdirSync(destParent, { recursive: true });

    let tempDir = "";
    try {
      if (sourcePathOrUrl.startsWith("http://") || sourcePathOrUrl.startsWith("https://") || sourcePathOrUrl.endsWith(".git")) {
        // Git Repository
        const folderName = path.basename(sourcePathOrUrl).replace(/\.git$/, "");
        const destPath = path.join(destParent, folderName);
        if (fs.existsSync(destPath)) {
          return { ok: false, error: `Plugin folder "${folderName}" already exists.` };
        }
        
        execSync(`git clone --depth 1 "${sourcePathOrUrl}" "${destPath}"`, { stdio: "pipe" });
        
        const manifestPath = path.join(destPath, "plugin.json");
        if (!fs.existsSync(manifestPath)) {
          fs.rmSync(destPath, { recursive: true, force: true });
          return { ok: false, error: "Repository is not a valid Cowrangler plugin: plugin.json missing." };
        }
        
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        const pluginId = manifest.id || folderName;
        
        // If pluginId does not match folderName, rename the folder to pluginId
        if (pluginId !== folderName) {
          const finalDest = path.join(destParent, pluginId);
          if (fs.existsSync(finalDest)) {
            fs.rmSync(destPath, { recursive: true, force: true });
            return { ok: false, error: `Plugin folder "${pluginId}" already exists.` };
          }
          fs.renameSync(destPath, finalDest);
        }
        
        return { ok: true, id: pluginId };
      } else if (sourcePathOrUrl.endsWith(".zip")) {
        // ZIP Archive
        if (!fs.existsSync(sourcePathOrUrl)) {
          return { ok: false, error: "ZIP file does not exist." };
        }

        const tempFolderName = `plugin-temp-${Date.now()}`;
        tempDir = path.join(destParent, tempFolderName);
        fs.mkdirSync(tempDir, { recursive: true });
        
        execSync(`unzip -q "${sourcePathOrUrl}" -d "${tempDir}"`, { stdio: "pipe" });

        let rootPluginDir = tempDir;
        let manifestPath = path.join(rootPluginDir, "plugin.json");
        
        if (!fs.existsSync(manifestPath)) {
          const files = fs.readdirSync(tempDir);
          if (files.length === 1 && fs.statSync(path.join(tempDir, files[0])).isDirectory()) {
            rootPluginDir = path.join(tempDir, files[0]);
            manifestPath = path.join(rootPluginDir, "plugin.json");
          }
        }

        if (!fs.existsSync(manifestPath)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
          return { ok: false, error: "ZIP file is not a valid Cowrangler plugin: plugin.json missing." };
        }

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        const pluginId = manifest.id || path.basename(rootPluginDir);
        const finalDest = path.join(destParent, pluginId);
        
        if (fs.existsSync(finalDest)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
          return { ok: false, error: `Plugin "${pluginId}" already exists.` };
        }

        fs.renameSync(rootPluginDir, finalDest);
        if (tempDir !== rootPluginDir && fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
        
        return { ok: true, id: pluginId };
      } else {
        // Local Folder Path
        const resolvedSrc = path.resolve(sourcePathOrUrl);
        if (!fs.existsSync(resolvedSrc) || !fs.statSync(resolvedSrc).isDirectory()) {
          return { ok: false, error: "Source path is not a valid directory." };
        }

        const manifestPath = path.join(resolvedSrc, "plugin.json");
        if (!fs.existsSync(manifestPath)) {
          return { ok: false, error: "Source directory is not a valid Cowrangler plugin: plugin.json missing." };
        }

        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        const pluginId = manifest.id || path.basename(resolvedSrc);
        const destPath = path.join(destParent, pluginId);
        
        if (fs.existsSync(destPath)) {
          return { ok: false, error: `Plugin "${pluginId}" already exists.` };
        }

        fs.mkdirSync(destPath, { recursive: true });
        const copyDirRecursive = (src: string, dest: string) => {
          const files = fs.readdirSync(src);
          for (const file of files) {
            const sPath = path.join(src, file);
            const dPath = path.join(dest, file);
            if (fs.statSync(sPath).isDirectory()) {
              fs.mkdirSync(dPath, { recursive: true });
              copyDirRecursive(sPath, dPath);
            } else {
              fs.copyFileSync(sPath, dPath);
            }
          }
        };
        copyDirRecursive(resolvedSrc, destPath);
        return { ok: true, id: pluginId };
      }
    } catch (e: any) {
      if (tempDir && fs.existsSync(tempDir)) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
      }
      return { ok: false, error: e?.message || String(e) };
    }
  }

  public uninstallPlugin(id: string): { ok: boolean; error?: string } {
    const localPath = path.join(this.getLocalPluginsDir(), id);
    const globalPath = path.join(this.getGlobalPluginsDir(), id);

    let deleted = false;
    if (fs.existsSync(localPath)) {
      fs.rmSync(localPath, { recursive: true, force: true });
      deleted = true;
    }
    if (fs.existsSync(globalPath)) {
      fs.rmSync(globalPath, { recursive: true, force: true });
      deleted = true;
    }

    if (!deleted) {
      return { ok: false, error: `Plugin "${id}" not found.` };
    }
    return { ok: true };
  }
}
