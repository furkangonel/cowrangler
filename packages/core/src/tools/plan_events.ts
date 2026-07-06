/**
 * plan_events — write_plan aracının ürettiği planı UI'a iletmek için hafif
 * bir yayıncı. ask_user.ts'teki listener desenini birebir taklit eder:
 * çekirdek (tool) tarafta bir listener kaydedilir, Electron IPC katmanı bu
 * listener'ı pencerelere `agent:plan` olayı olarak köprüler.
 *
 * Böylece plan yalnızca diske (.cowrangler/plans/<session>.md) yazılıp modele
 * dönmekle kalmaz; sağ paneldeki Plan bölümünde de canlı görünür.
 */

export interface PlanStep {
  step: number;
  description: string;
  files?: string[];
  risk?: "low" | "medium" | "high" | string;
}

export interface PlanPayload {
  title: string;
  summary: string;
  steps: PlanStep[];
  estimated_duration?: string;
  notes?: string;
  /** Diskteki plan.md içeriği (render için hazır). */
  markdown: string;
  /** Onay durumu — write_plan akışı ilerledikçe güncellenir. */
  status: "pending" | "approved" | "rejected" | "modify";
  sessionId?: string | null;
  createdAt: string;
}

export type PlanListener = (payload: PlanPayload) => void;

let listener: PlanListener | null = null;

export function setPlanListener(cb: PlanListener | null): void {
  listener = cb;
}

export function emitPlan(payload: PlanPayload): void {
  try {
    listener?.(payload);
  } catch {
    /* UI köprüsü yoksa/patlarsa plan akışı etkilenmesin */
  }
}
