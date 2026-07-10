import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { closeApp, launchApp, type LaunchedApp } from "./fixtures";

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await closeApp(launched);
});

test("export:saveCopy writes the source file to the path chosen in the native save dialog", async () => {
  const { app, window } = launched;

  const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "cowrangler-e2e-export-src-"));
  const srcPath = path.join(srcDir, "report.html");
  fs.writeFileSync(srcPath, "<html><body>hello export</body></html>", "utf8");

  const destDir = fs.mkdtempSync(path.join(os.tmpdir(), "cowrangler-e2e-export-dest-"));
  const destPath = path.join(destDir, "report-copy.html");

  // Native OS kayıt dialog'unu Playwright doğrudan süremez — Electron main
  // process'inde dialog.showSaveDialog'u sabit bir sonuçla stub'luyoruz. Bu,
  // Electron E2E'de native dialog'ları test etmenin standart yoludur; export
  // IPC handler'ının (dialog sonrası) gerçek dosya kopyalama mantığı hâlâ
  // olduğu gibi çalışır.
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath })) as any;
  }, destPath);

  const result = await window.evaluate(async (srcPath) => {
    return (window as any).electronAPI.exporter.saveCopy({ srcPath });
  }, srcPath);

  expect(result.ok).toBe(true);
  expect(result.path).toBe(destPath);
  expect(fs.existsSync(destPath)).toBe(true);
  expect(fs.readFileSync(destPath, "utf8")).toContain("hello export");

  fs.rmSync(srcDir, { recursive: true, force: true });
  fs.rmSync(destDir, { recursive: true, force: true });
});

test("export:saveCopy returns an error when the source file does not exist", async () => {
  const { window } = launched;

  const result = await window.evaluate(async () => {
    return (window as any).electronAPI.exporter.saveCopy({ srcPath: "/nonexistent/path/does-not-exist.html" });
  });

  expect(result.ok).toBe(false);
  expect(result.error).toBeTruthy();
});
