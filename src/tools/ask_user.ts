import { z } from 'zod'
import { registerTool } from './registry.js'

// Options may arrive as plain strings or as rich {label, description} objects —
// different models format them differently, so we accept both and normalize.
const optionSchema = z.union([
  z.string(),
  z.object({
    label: z.string(),
    description: z.string().optional(),
  }),
])

export const askUserDef = {
  name: 'ask_user',
  description: 'Use this tool to ask the user one or more multiple-choice questions, with the goal of clarifying underspecified requirements, getting design feedback, or resolving ambiguity. Execution will pause until the user responds. Each option may be a plain string, or an object with "label" and optional "description".',
  parameters: z.object({
    questions: z.array(z.object({
      question: z.string().describe('The question to ask the user.'),
      options: z.array(optionSchema).describe('The options. Each is a string, or {label, description}. At least 2.'),
      is_multi_select: z.boolean().optional().describe('If true, the user can select multiple options.')
    }))
  })
}

/** Collapse a string|{label,description} option into a single display string. */
function normalizeOption(opt: string | { label: string; description?: string }): string {
  if (typeof opt === 'string') return opt
  return opt.description ? `${opt.label} — ${opt.description}` : opt.label
}

let askResolver: ((answer: string) => void) | null = null

export function resolveAskUser(answer: string) {
  if (askResolver) {
    askResolver(answer)
    askResolver = null
  }
}

/**
 * Unblock a pending ask_user without a real answer — used when the user presses
 * Stop. The awaiting tool resolves with a sentinel so the agent loop can wake up
 * and honour the interrupt flag instead of hanging forever on user input.
 */
export function cancelPendingAskUser() {
  if (askResolver) {
    askResolver('[interrupted]')
    askResolver = null
  }
}

/** Is the agent currently parked waiting for a user answer? */
export function hasPendingAskUser(): boolean {
  return askResolver !== null
}

// Subscribe to ask user events so UI can show the prompt
export interface AskUserPayload {
  questions: { question: string; options: string[]; is_multi_select: boolean }[]
  meta?: {
    projectId?: string | null;
    sessionId?: string | null;
  }
}

export type AskUserListener = (payload: AskUserPayload) => void
let listener: AskUserListener | null = null
export function setAskUserListener(cb: AskUserListener | null) {
  listener = cb
}

export async function executeAskUser(
  args: z.infer<typeof askUserDef.parameters>, 
  meta?: { projectId?: string | null, sessionId?: string | null }
): Promise<string> {
  let activeSessionId = meta && typeof meta === 'object' && 'sessionId' in meta ? (meta as any).sessionId : undefined;
  if (!activeSessionId) {
    try {
      const { getActiveSessionId } = await import("../core/project_context.js");
      activeSessionId = getActiveSessionId();
    } catch {
      // ignore
    }
  }

  // Normalize to the shape every UI expects: options are plain strings,
  // is_multi_select is always a boolean.
  const payload: AskUserPayload = {
    meta: {
      ...(meta && typeof meta === 'object' ? meta : {}),
      sessionId: activeSessionId,
    },
    questions: (args.questions ?? []).map(q => {
      // LLMs sometimes pass a single string with newlines instead of an array of options.
      // We split them here so the UI can render them as distinct selectable choices.
      const normalizedOptions = (q.options ?? [])
        .map(normalizeOption)
        .flatMap(opt => opt.split('\n').map(s => s.trim()).filter(Boolean));

      return {
        question: q.question,
        options: normalizedOptions,
        is_multi_select: q.is_multi_select ?? false,
      };
    }),
  }
  return new Promise((resolve) => {
    askResolver = resolve
    if (listener) {
      listener(payload)
    } else {
      // Fallback if no UI is attached
      console.log(`[QA Tool] Agent asks: ${JSON.stringify(payload.questions)}`)
    }
  })
}

registerTool(
  askUserDef.name,
  askUserDef.description,
  askUserDef.parameters,
  executeAskUser
)
