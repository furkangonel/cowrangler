/**
 * memory_provider — takılabilir uzun-dönem hafıza arayüzü.
 *
 * hermes'in MemoryProvider ABC'sine karşılık. Sağlayıcılar konuşma turlarını
 * senkronize eder ve sorguya göre ilgili geçmişi geri getirir. `MemoryManager`
 * kayıtlı sağlayıcıları orkestre eder; agent tur sonrası `syncTurn` ve tur
 * öncesi `prefetch` çağırır.
 */

export interface MemoryProvider {
  readonly id: string;
  /** Bir konuşma turunu kalıcılaştır. */
  syncTurn(userMessage: string, assistantMessage: string): void | Promise<void>;
  /** Sorguyla ilgili geçmiş anıları döndür (boş string = ilgili yok). */
  prefetch(query: string): string | Promise<string>;
}

export class MemoryManager {
  private providers: MemoryProvider[] = [];

  add(provider: MemoryProvider): void {
    if (!this.providers.some((p) => p.id === provider.id)) this.providers.push(provider);
  }

  get enabled(): boolean {
    return this.providers.length > 0;
  }

  async prefetch(query: string): Promise<string> {
    const parts: string[] = [];
    for (const p of this.providers) {
      try {
        const r = await p.prefetch(query);
        if (r && r.trim()) parts.push(r.trim());
      } catch { /* sağlayıcı hatası akışı bozmaz */ }
    }
    return parts.join("\n\n");
  }

  async syncTurn(userMessage: string, assistantMessage: string): Promise<void> {
    for (const p of this.providers) {
      try { await p.syncTurn(userMessage, assistantMessage); } catch { /* yok say */ }
    }
  }
}

let _manager: MemoryManager | null = null;
export function getMemoryManager(): MemoryManager {
  if (!_manager) _manager = new MemoryManager();
  return _manager;
}

/** Varsayılan yerel recall sağlayıcısını kaydeder (startup'ta çağrılır). */
export async function initDefaultMemory(base?: string): Promise<void> {
  try {
    const { LocalRecallProvider } = await import("./memory/local_recall.js");
    getMemoryManager().add(new LocalRecallProvider(base));
  } catch { /* backend yoksa boş manager */ }
}
