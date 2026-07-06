/**
 * Synchronized output (DEC private mode 2026) for the Ink TUI.
 *
 * caveman-code'un `packages/tui/src/sync-output.ts` disiplininin küçük bir
 * port'u. Her yazma (frame) `\x1b[?2026h` … `\x1b[?2026l` ile sarılınca
 * terminal frame'i **atomik** commit eder; yarım çizilmiş ekran (ara-frame
 * flicker) ortadan kalkar.
 *
 * Ink 5 frame başına tek bir `write()` çağrısı yapar (log-update), bu yüzden
 * `stdout.write`'ı sarmak her frame'i atomik hale getirmeye yeter — Ink'in
 * reconciler'ına dokunmadan.
 *
 * Desteklemeyen terminaller bu private-mode sekanslarını **yok sayar** (her
 * yerde güvenli). tmux/screen passthrough gerektirdiği için orada kapalı
 * tutulur; aksi halde sekans literal görünebilir.
 */

export const BEGIN_SYNC = "\x1b[?2026h";
export const END_SYNC = "\x1b[?2026l";

export type SyncSupport = "enabled" | "disabled";

/**
 * Senkronize çıktının bu terminalde güvenle kullanılıp kullanılamayacağını
 * sınıflandırır. Tespit muhafazakârdır: emin değilsek kapatırız.
 */
export function classifySyncOutputSupport(
  stream: NodeJS.WriteStream = process.stdout,
  env: NodeJS.ProcessEnv = process.env,
): SyncSupport {
  // TTY değilse (pipe/redirect) hiçbir kontrol sekansı basma.
  if (!stream.isTTY) return "disabled";

  // Açık kaçış valfi.
  if (env.COWRANGLER_NO_SYNC === "1" || env.NO_SYNC_OUTPUT === "1") {
    return "disabled";
  }

  // tmux/screen: passthrough olmadan sekans literal görünebilir → kapalı.
  if (env.TMUX) return "disabled";
  const term = env.TERM ?? "";
  if (term.startsWith("screen") || term.startsWith("tmux")) return "disabled";

  // Bilinmeyen private-mode sekansları uyumlu terminallerce yok sayılır,
  // bu yüzden geri kalan her TTY'de güvenle açılır.
  return "enabled";
}

/**
 * `stream.write`'ı, string frame'leri DEC 2026 begin/end ile saracak şekilde
 * monkey-patch eder. Begin/frame/end tek bir `write` çağrısında birleştirilir
 * ki atomik commit tek syscall'da olsun.
 *
 * @returns Yamanın kaldırılması için çağrılacak fonksiyon.
 */
export function installSyncOutput(
  stream: NodeJS.WriteStream = process.stdout,
  env: NodeJS.ProcessEnv = process.env,
): () => void {
  if (classifySyncOutputSupport(stream, env) !== "enabled") {
    return () => {};
  }

  const original = stream.write.bind(stream);

  const patched: typeof stream.write = ((chunk: any, ...rest: any[]) => {
    // Yalnızca string frame'leri sar; Buffer'lar (nadir) dokunulmadan geçer.
    if (typeof chunk === "string" && chunk.length > 0) {
      return original(BEGIN_SYNC + chunk + END_SYNC, ...rest);
    }
    return original(chunk, ...rest);
  }) as typeof stream.write;

  stream.write = patched;

  return () => {
    // Yalnızca hâlâ bizim yamamızsa geri al (başka bir katman üstüne yazmış olabilir).
    if (stream.write === patched) {
      stream.write = original;
    }
  };
}
