import { test, expect } from "@playwright/test";
import { closeApp, launchApp, type LaunchedApp } from "./fixtures";

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await closeApp(launched);
});

test("app launches, shows the welcome/empty state, and preload wires up window.electronAPI with no console errors", async () => {
  const { app, window } = launched;

  const consoleErrors: string[] = [];
  window.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // Pencere gerçekten açıldı.
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBeGreaterThan(0);
  await window.waitForSelector("body", { state: "attached" });

  // Temiz $HOME'da hiç proje yok → "Welcome to Cowrangler" boş durumu render
  // olmalı. Bu görünmüyorsa uygulama boş beyaz ekranda takılı kalmış demektir
  // (ör. preload yüklenemedi, window.electronAPI eksik — bkz. preload.ts).
  await expect(window.getByText("Welcome to Cowrangler")).toBeVisible({ timeout: 20_000 });
  await expect(window.getByRole("button", { name: "Create new project" })).toBeVisible();

  expect(consoleErrors, `unexpected renderer console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
});
