import { test, expect } from "@playwright/test";
import { closeApp, createFirstProject, launchApp, type LaunchedApp } from "./fixtures";

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
  await createFirstProject(launched.window);
});

test.afterEach(async () => {
  await closeApp(launched);
});

test("dropping a file onto the composer attaches it via the fs:addFileBytes IPC path", async () => {
  const { window } = launched;

  const dropZone = window.getByTestId("composer-drop-zone");
  await expect(dropZone).toBeVisible();

  // Playwright'ın electron _electron.launch() ile açtığı pencerede gerçek bir
  // OS sürükle-bırağı simüle edemeyiz (webUtils.getPathForFile bir disk yolu
  // döndürmez), ama useFileDrop.ts TAM OLARAK bu senaryo için bir fallback
  // içeriyor: yol yoksa dosya byte olarak fs:addFileBytes ile yüklenir (bkz.
  // apps/desktop/src/desktop/lib/useFileDrop.ts, `blobs` dalı). Sentetik bir
  // DataTransfer + File ile bu yolu gerçekten tetikliyoruz.
  const dataTransfer = await window.evaluateHandle(() => {
    const dt = new DataTransfer();
    const file = new File(["hello from e2e"], "e2e-note.txt", { type: "text/plain" });
    dt.items.add(file);
    return dt;
  });

  await dropZone.dispatchEvent("drop", { dataTransfer });

  const chip = window.getByTestId("attached-file-chip");
  await expect(chip).toBeVisible({ timeout: 15_000 });
  await expect(chip).toContainText("e2e-note.txt");
});
