/**
 * Desktop feature flags — tek kaynak.
 *
 * Desktop has one project-based Code surface. Design runs in its own window.
 */
export const FEATURES = {
  /** Project-based Code workspace. */
  code: true,
} as const;

export type FeatureName = keyof typeof FEATURES;
