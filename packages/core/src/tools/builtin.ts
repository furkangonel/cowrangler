/**
 * builtin.ts — Tüm yerleşik araç modüllerini tek noktadan yan-etki (side-effect)
 * importu ile yükler. Her modül, yüklendiğinde registry.register*() çağrısıyla
 * kendini global TOOL_SCHEMAS'a kaydeder.
 *
 * KRİTİK: Bu dosyadan ÖNCE desktop (Electron) süreci yalnızca file_tools ve
 * brief_tool modüllerini import ediyordu (agent_manager / agent.ts üzerinden);
 * system/git/web/dev/skill araçları ve MCP introspection HİÇ yüklenmiyordu.
 * Sonuç: desktop agent'ı CLI'ye kıyasla çok kısıtlı bir araç setiyle çalışıyordu.
 * Hem CLI (main.ts) hem desktop (electron/main.ts) bu bootstrap'ı import etmeli.
 */

import "./system_tools.js";
import "./git_tools.js";
import "./file_tools.js";
import "./web_tools.js";
import "./skill_tools.js";
import "./dev_tools.js";
import "./repomap_tool.js";
import "./semantic_search.js";
import "./media_tools.js";
import "./brief_tool.js";
import "./computer_use.js";
import "./mcp_status_tool.js";
import "./ask_user.js";
import "./preview_tools.js";

// Birleşik facade aracı (explore) — VARSAYILAN KAPALI. Gemini function-calling'i
// explore'un birleşik şemasını (enum action + çok opsiyonel param) akıtırken adımı
// kapatamayıp stream'i donduruyor (model tool-call'ı emit ediyor ama hiç yürütülmüyor).
// Basit şemalı orijinal araçlar (read_file/search_in_files/glob_files/list_files)
// doğrudan çalışıyor. Token birleştirmesini istersen COWRANGLER_ENABLE_EXPLORE=1 ile
// aç — ama önce kullandığın modelde çalıştığını doğrula.
import { registerFacades } from "./facades.js";
if (process.env.COWRANGLER_ENABLE_EXPLORE === "1") registerFacades();
