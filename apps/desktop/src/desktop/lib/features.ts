/**
 * Desktop feature flags — tek kaynak.
 *
 * Chat (General Chat) modu tamamen kaldırıldı (2026-07-06). Kalan yüzeyler:
 *   - Cowork (projects) → varsayılan
 *   - Code → src/desktop/components/session/CodeSessionView.tsx (tab, sessionlar, git, sağ panel)
 */
export const FEATURES = {
  /** Code sekmesi + kod yüzeyleri. Kendine özel tab — proje hiyerarşisinden bağımsız. */
  code: true,
} as const;

export type FeatureName = keyof typeof FEATURES;
