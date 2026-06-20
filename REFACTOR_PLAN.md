# Cowrangler — Kavramsal Sadeleştirme & Production Refactor Planı

> Hedef: "homemade agent system" — sade, temiz, kusursuz. Kavramlar net ve her biri kendi kulvarında.
> Tarih: 2026-06-20

---

## 0. Kavram Sözlüğü (tek doğru tanım)

| Kavram | Tanım | Nerede yaşar | Kapsam |
|--------|-------|--------------|--------|
| **SKILL** | Markdown prosedürel bellek. **Her zaman global.** Bir projede çağrılınca o projenin CONTEXT'ine **kopyalanır.** | `~/.cowrangler/skills/` (global kaynak) + proje `CONTEXT` (kopya) | Global → kopyalanır |
| **CONTEXT** | Bir projenin aktif çalışma bağlamı: agent'ın kendi kararıyla yazdığı **MEMORY** + projeye **kopyalanmış SKILL'ler**. | `{proje}/.cowrangler/context/` | Proje-yerel |
| **CONNECTOR** | Kullanıcıya "Connector" diye sunulan **MCP** işlevi. Popülerlerden bir **browse** listesi; ekle→karşı tarafla **auth**→bağlan. Manuel ekleme de var. | `~/.cowrangler/config.yaml > mcp_servers` | Global |
| **PLUGIN** | Önceden gelen, **cowrangler imzalı** paketler (skill + connector + tool bundle'ları). | bundled `plugins_catalog` + `~/.cowrangler/plugins/` | Global |
| **PROJECT** | name (zorunlu) + instructions (ops.) + files/folders (çoklu). Logo yok. | `~/.cowrangler/projects.db` + `{proje}/.cowrangler/` | — |
| **SESSION** | Proje içi konuşma. Adı = ilk promptun ilk 20 karakteri. | `~/.cowrangler/sessions` (SQLite) | Proje-yerel |
| **PROGRESS** | Desktop'ta canlı madde-madde plan (yapılıyor/tamamlandı). Kanban'ın desktop karşılığı. | Runtime | Desktop |
| **KANBAN** | Çok-ajanlı iş kuyruğu. **Yalnız CLI.** | `~/.cowrangler/kanban.db` | CLI-only |

Çoklu **CONNECTOR** ve **PLUGIN** global; **MEMORY** ve kopyalanan **SKILL** proje CONTEXT'inde. Tüm bu kavramlar CLI'da da geçerli (tek core).

---

## Faz 1 — Connectors + Plugins + Model (öncelik)

### 1.1 Connectors tek kavrama iner
- **Sorun:** `ConnectorsTab.tsx` ve `MCPTab.tsx` birebir aynı; ham "stdio/url ekle" formu. Browse/auth yok.
- **Yeni dosya:** `src/core/connectors_catalog.ts` — kürasyonlu, **gerçekten çalışan** connector tanımları
  (`stdio` npx server'lar + remote OAuth/anahtar gerektiren popülerler). Her giriş: `id, name, description,
  category, transport, auth ('none'|'apikey'|'oauth'|'token'), config, popular`.
- **IPC genişlet** (`mcp.ipc.ts` → `connectors.ipc.ts`'e yeniden adlandır niyetiyle):
  - `connectors:catalog` → katalogu döndürür (browse)
  - `connectors:add` → katalog girişinden config'i `mcp_servers`'a yazar; `auth` gerektiriyorsa kimlik akışını tetikler
  - `connectors:list / remove / test` (mevcut mcp:* korunur, alias).
- **UI:** `ConnectorsTab.tsx` → iki bölüm: (a) "Browse" kart grid'i (katalog), (b) "Bağlı" liste + "Manuel ekle".
  `MCPTab.tsx` **silinir** (Settings'ten kaldırılır; manuel ekleme Connectors içine taşınır).
- **Auth:** `auth==='apikey'|'token'` → input modal; `auth==='oauth'` → sistem tarayıcısında OAuth + loopback callback.

### 1.2 Plugins — cowrangler imzalı default katalog
- **Yeni dosya:** `src/core/plugins_catalog.ts` — `BUNDLED_PLUGINS` (id, name, author:'cowrangler', signed:true,
  içerdiği skill/connector/tool referansları, enabledByDefault).
- `PluginManager.loadAll()` önce bundled katalogu, sonra `~/.cowrangler/plugins/`'i yükler.
- **UI:** Settings'e `PluginsTab.tsx` — bundled (imzalı rozet) + kullanıcı plugin'leri; aç/kapat.

### 1.3 Model — hardcoded liste KALDIRILIR
- `settings.ipc.ts > AVAILABLE_MODELS` **silinir.** Modeller dinamik:
  - Anahtarı girilmiş provider'lar için canlı `/models` keşfi (Anthropic/OpenAI/OpenRouter list endpoint'leri),
    sonuç `~/.cowrangler/cache/models.json`'a cache.
  - `model_metadata.ts` yalnız *meta zenginleştirme* (context window/pricing) için kalır; "seçilebilir liste" kaynağı olmaktan çıkar.
- `settings.store.ts` default fallback `'openrouter/google/gemini-2.5-flash'` **kaldırılır** → default boş; kullanıcı
  ilk bağlı provider/connector'dan seçer. Varsayılan deneyim model listesi değil **default CONNECTORS + PLUGINS**.

---

## Faz 2 — SKILL → CONTEXT kopyalama

- **project_context.ts:** `getProjectContextDir()` = `{workdir}/.cowrangler/context`,
  `getProjectContextSkillsDir()` = `.../context/skills`.
- **skills.ts:** `copySkillToContext(skillId)` — global/bundled skill klasörünü proje context'ine kopyalar; `.usage`'a işler.
- **agent.ts `_buildSystemPrompt`:** tüm skill'leri her tur enjekte etmek yerine **yalnız CONTEXT'e kopyalanmış**
  skill'leri enjekte eder (prompt cache korunur). `utilize_skill` çağrısı → `copySkillToContext` + reload.
- **CONTEXT = MEMORY (`memory.md`) + context/skills/** olarak tek modelde toplanır; `ContextPanel` bunu gösterir.

---

## Faz 3 — Proje/Session sadeleştirme + Kanban gating

- **project_db.ts / NewProjectModal:** `icon`/`color` opsiyonel; UI'da logo seçimi yok (yalnız name+instructions+files).
  Şema geriye dönük uyumlu (DEFAULT'lar kalır, UI göstermez).
- **Session adı:** oluşturulurken `title` boşsa ilk prompt'tan `slice(0,20)` garanti edilir (agent_manager/sessions IPC).
- **Kanban:** desktop'ta hiçbir yüzeyde gösterilmez; yalnız CLI komutu. `src/kanban` import'ları desktop bundle'ından dışlanır.

---

## Doğrulama
- `npm run build` (tsc) temiz.
- `npm test` (vitest) — yeni katalog modülleri için birim testleri.
- Desktop: `npm run desktop:build` derlenir; Connectors browse→ekle→auth, Plugins aç/kapat, model listesi dinamik gelir.
