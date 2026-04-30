import { z } from "zod";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { registerTool } from "./registry.js";
import { PROJECT_ROOT, LOCAL_DIR } from "../core/init.js";

// 1. BASH TOOL
registerTool(
  "execute_bash",
  "Sistem terminalinde herhangi bir bash komutunu (npm, git, ls, grep vb.) çalıştırır ve çıktısını döndürür. DİKKAT: Etkileşimli (interactive) komutlar (vim, nano) çalıştırma.",
  z.object({
    command: z.string().describe("Çalıştırılacak terminal komutu"),
  }),
  async ({ command }: { command: string }) => {
    try {
      // Güvenlik ve bağlam için komutu hep proje kök dizininde çalıştırıyoruz
      const output = execSync(command, {
        cwd: PROJECT_ROOT,
        encoding: "utf-8",
        timeout: 30000, // 30 saniye zaman aşımı (sonsuz döngüleri engellemek için)
        stdio: ["ignore", "pipe", "pipe"], // stdin kapalı, sadece stdout ve stderr okuyoruz
      });
      return output.trim() || "Komut başarıyla çalıştı, çıktı yok.";
    } catch (e: any) {
      // Komut hata verirse (örneğin testler fail olursa) hatayı ve stderr'i döndür ki ajan neyi düzelteceğini bilsin
      return `KOMUT BAŞARISIZ OLDU:\nÇıktı: ${e.stdout?.toString()}\nHata: ${e.stderr?.toString() || e.message}`;
    }
  },
);

// 2. SLEEP TOOL
registerTool(
  "sleep",
  "Sistemi belirli bir milisaniye kadar bekletir. Bir sunucunun kalkmasını veya bir dosyanın derlenmesini beklemek için kullanışlıdır.",
  z.object({
    ms: z
      .number()
      .min(100)
      .max(60000)
      .describe(
        "Beklenecek süre (milisaniye cinsinden. Örn: 5 saniye için 5000)",
      ),
  }),
  async ({ ms }: { ms: number }) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return `Sistem ${ms}ms boyunca bekletildi.`;
  },
);

// 3. TODO WRITE TOOL
const TODO_FILE = path.join(LOCAL_DIR, "AGENT_TODO.md");

registerTool(
  "manage_todo",
  "Ajanın kendi iş planını takip etmesi için bir TODO listesi oluşturur veya günceller.",
  z.object({
    action: z
      .enum(["read", "update"])
      .describe("Listeyi okumak veya güncellemek"),
    content: z
      .string()
      .optional()
      .describe(
        "Eğer update seçildiyse yeni TODO listesi içeriği (Markdown checklist formatında)",
      ),
  }),
  async ({ action, content }: { action: string; content?: string }) => {
    try {
      if (action === "read") {
        if (!fs.existsSync(TODO_FILE))
          return "Şu an aktif bir TODO listesi yok.";
        return fs.readFileSync(TODO_FILE, "utf-8");
      }

      if (action === "update" && content) {
        fs.writeFileSync(TODO_FILE, content, "utf-8");
        return "TODO listesi başarıyla güncellendi.";
      }

      return "Hatalı kullanım: update işlemi için content gereklidir.";
    } catch (e: any) {
      return `HATA: ${e.message}`;
    }
  },
);
