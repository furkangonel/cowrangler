/**
 * mcp_status — Agent'ın MCP (Model Context Protocol) sunucularının CANLI
 * durumunu görebilmesi için introspection aracı.
 *
 * Bu olmadan agent, yalnızca registry'de kayıtlı MCP araçlarını görür ama bir
 * sunucunun neden bağlanamadığını (ör. eksik API anahtarı, yanlış komut)
 * açıklayamaz. Kullanıcı "X MCP'sini kullanabiliyor musun?" / "hangi connector'lar
 * bağlı?" / "neden çalışmıyor?" diye sorduğunda agent bu aracı çağırıp gerçek
 * durumu ve eksikleri bildirebilir.
 */

import { registerTool } from "./registry.js";
import { getMCPManager } from "../core/mcp_client.js";
import { z } from "zod";

registerTool(
  "mcp_status",
  "Yapılandırılmış MCP sunucularının canlı durumunu döndürür: her sunucu için " +
    "bağlı mı (connected), kaç araç keşfedildi (toolCount) ve varsa bağlantı " +
    "hatası (error). Kullanıcı bir connector/MCP'yi kullanıp kullanamadığını, " +
    "hangi connector'ların bağlı olduğunu veya bir MCP'nin neden çalışmadığını " +
    "sorduğunda BU ARACI çağır ve sonucu yorumla.",
  z.object({}).passthrough(),
  async () => {
    const mgr = getMCPManager();
    const statuses = mgr.getStatuses();

    if (!mgr.isInitialized() || statuses.length === 0) {
      return JSON.stringify({
        summary: "Hiç MCP sunucusu bağlı değil.",
        initialized: mgr.isInitialized(),
        servers: [],
        hint:
          "Ayarlar → Connectors/MCP bölümünden bir sunucu ekleyin. Eklenmişse " +
          "uygulamanın yeniden başlatılması veya config'in yeniden yüklenmesi gerekebilir.",
      });
    }

    return JSON.stringify({
      summary: mgr.summary(),
      initialized: true,
      servers: statuses.map((s) => ({
        name: s.name,
        type: s.type,
        connected: s.connected,
        toolCount: s.toolCount,
        error: s.error ?? null,
      })),
    });
  },
);
