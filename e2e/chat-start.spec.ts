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

test("typing a message and starting a chat round-trips through the agent IPC pipeline", async () => {
  const { window } = launched;

  const input = window.getByTestId("chat-input");
  await input.fill("hello from the e2e test");
  await window.getByTestId("chat-send-button").click();

  // Session görünümüne geçildi ve kullanıcı mesajı (optimistik) render oldu.
  await expect(window.getByTestId("user-message").last()).toContainText("hello from the e2e test", {
    timeout: 15_000,
  });

  // İzole $HOME'da hiç model/API anahtarı yapılandırılmadığı için gerçek bir
  // LLM cevabı beklemiyoruz — ama main process'e gidip bir hata ile dönmesi
  // (agent:error → UI) tüm IPC zincirinin (renderer → main → agent → renderer)
  // gerçekten çalıştığını kanıtlar.
  await expect(window.getByText(/error/i).first()).toBeVisible({ timeout: 30_000 });
});
