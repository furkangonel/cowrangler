import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MAIN_ENTRY = path.join(REPO_ROOT, "apps/desktop/out/main/index.js");

export interface LaunchedApp {
  app: ElectronApplication;
  window: Page;
  /** İzole $HOME — testler gerçek kullanıcının ~/.cowrangler'ına dokunmaz. */
  homeDir: string;
}

/**
 * Uygulamayı, gerçek kullanıcı config/credentials'ından tamamen izole,
 * geçici bir $HOME ile başlatır (GLOBAL_DIR = $HOME/.cowrangler, bkz.
 * packages/core/src/init.ts). Her testin kendi temiz durumu olur.
 */
export async function launchApp(): Promise<LaunchedApp> {
  if (!fs.existsSync(MAIN_ENTRY)) {
    throw new Error(
      `Electron build not found at ${MAIN_ENTRY} — run "npm run desktop:build" (or the e2e pretest script) first.`,
    );
  }

  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "cowrangler-e2e-home-"));

  const app = await electron.launch({
    args: [MAIN_ENTRY],
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir, // Windows os.homedir() karşılığı
      COWRANGLER_E2E: "1",
      NODE_ENV: "test",
    },
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  return { app, window, homeDir };
}

export async function closeApp(launched: LaunchedApp): Promise<void> {
  await launched.app.close().catch(() => {});
  fs.rmSync(launched.homeDir, { recursive: true, force: true });
}

/**
 * İzole $HOME'da hiç proje yoktur (temiz kurulum) — "Welcome to Cowrangler"
 * boş durumu gösterilir. Testlerin çoğu bir composer'a (InputArea) ihtiyaç
 * duyar, ki bu yalnızca bir proje aktifken render olur. Bu yardımcı, boş
 * durumdan başlayıp ilk projeyi oluşturur ve ProjectHome'a düşer.
 */
export async function createFirstProject(window: LaunchedApp["window"], name = "e2e-test-project"): Promise<void> {
  await window.getByRole("button", { name: "Create new project" }).click();
  const nameInput = window.getByPlaceholder("e.g. Marketing site");
  await nameInput.waitFor({ state: "visible" });
  await nameInput.fill(name);
  await window.getByRole("button", { name: "Create project" }).click();
  // Modal kapanana ve ProjectHome'un composer'ı (InlineNewTask) render olana kadar bekle.
  await window.getByTestId("chat-input").waitFor({ state: "visible", timeout: 15_000 });
}
