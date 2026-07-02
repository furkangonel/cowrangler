/**
 * login_cli — `cowrangler login` interaktif abonelik OAuth sihirbazı.
 *
 * Kullanıcı aboneliğiyle (Claude Pro, ChatGPT Plus, Copilot, Gemini,
 * Antigravity) giriş yapar; token'lar şifreli kasaya yazılır ve sonraki
 * çalıştırmalarda API key olmadan kullanılır.
 */

import * as p from "@clack/prompts";
import chalk from "chalk";
import { t } from "../i18n/index.js";
import {
  loginOAuth,
  logoutOAuth,
  listOAuthProviders,
  type OAuthProviderId,
} from "../core/oauth_subscriptions.js";

export async function runLoginWizard(preselect?: string): Promise<void> {
  p.intro(chalk.hex("#F26A38").bold(`  ${t("login.title")}`));

  const providers = listOAuthProviders();
  let id = preselect as OAuthProviderId | undefined;

  if (!id) {
    const choice = await p.select({
      message: t("login.which"),
      options: [
        ...providers.map((pr) => ({
          value: pr.id,
          label: pr.name + (pr.connected ? chalk.green(`  ✓ ${t("login.connected")}`) : ""),
        })),
        { value: "__logout__", label: chalk.dim(t("login.signout_option")) },
      ],
    });
    if (p.isCancel(choice)) { p.cancel(t("login.cancelled")); return; }
    id = choice as OAuthProviderId;
  }

  if (id === ("__logout__" as any)) {
    const which = await p.select({
      message: t("login.signout_which"),
      options: providers.filter((x) => x.connected).map((x) => ({ value: x.id, label: x.name })),
    });
    if (p.isCancel(which)) { p.cancel(t("login.cancelled")); return; }
    logoutOAuth(which as OAuthProviderId);
    p.outro(chalk.green(t("login.signed_out", { id: String(which) })));
    return;
  }

  const spin = p.spinner();
  try {
    // spin.stop() içeride onAuth callback'inde çağrılıyor — başlatılmamış bir
    // spinner'da .stop() clack internal'inde "i is not a function" ile patlıyor
    // (start() hiç çağrılmadan cursor-restore closure'ı set edilmemiş oluyor).
    spin.start(t("login.connecting"));
    await loginOAuth(id, {
      onAuth: ({ url, instructions }) => {
        spin.stop();
        p.note(`${instructions ? instructions + "\n\n" : ""}${chalk.cyan(url)}`, t("login.open_browser"));
        spin.start(t("login.waiting"));
      },
      onProgress: (m) => spin.message(m),
    });
    spin.stop();
    p.outro(chalk.green(`✓ ${t("login.signed_in", { id })}`));
  } catch (e: any) {
    spin.stop();
    p.cancel(chalk.red(t("login.failed", { error: e?.message ?? String(e) })));
  }
}
