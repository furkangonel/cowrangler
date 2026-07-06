# Gizli Settings Sekmeleri — Geri Açma Talimatı (WP-6)

Code-geliştirme akışına ait Settings sekmeleri şimdilik **gizlendi**. Kod
**silinmedi**; tek bir feature flag ile geri gelir.

## Nasıl geri açılır

`src/desktop/lib/features.ts` içinde:

```ts
export const FEATURES = {
  code: true,   // false → aşağıdaki Settings sekmeleri gizlenir
} as const;
```

> Not: Chat modu (`FEATURES.chat`) 2026-07-06'da tamamen kaldırıldı; artık yalnız
> `code` flag'i var ve kalıcı olarak `true`.

`code: true` → aşağıdaki tüm Settings sekmeleri görünür.

## Gizlenen sekmeler

`src/desktop/components/settings/SettingsPage.tsx`:

```ts
const CODE_TAB_IDS = new Set(['permissions', 'sandbox', 'git'])
const TABS = ALL_TABS.filter(t => FEATURES.code || !CODE_TAB_IDS.has(t.id))
```

| Sekme | id | Component (korunuyor) |
|------|-----|-----------------------|
| Permissions | `permissions` | `PermissionsTab.tsx` |
| Sandbox | `sandbox` | `SandboxTab.tsx` |
| Git | `git` | `GitTab.tsx` |

## Kalan (görünür) sekmeler

Models & API, Advanced, Appearance. Bunlar code'a özgü değil, açık kaldı.

## Notlar

- Sekme kaydı (`ALL_TABS`) ve render koşulları (`{mainTab === 'git' && <GitTab/>}`)
  korunuyor; yalnızca `TABS` filtresi ile nav'dan çıkarıldı. Gizli sekmeye
  yönlendirme olursa `mainTab` **Models**'e düşer (blank ekran olmaz).
- **Kısmen yapıldı:** `AdvancedTab` içindeki *code'a özgü alt bölümler* ayrı ayrı
  ayrılıp gizlenmedi (sekme bütün olarak görünür kalıyor). Gerekirse AdvancedTab
  içinde bölüm-bazlı `FEATURES.code` gate'i eklenebilir.
- Aynı flag Chat + Code yüzeylerini de yönetir. Bkz.
  `src/desktop/components/code/HIDDEN_CODE_README.md` (WP-4).
