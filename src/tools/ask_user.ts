import { z } from 'zod'
import { registerTool } from './registry.js'

export const askUserDef = {
  name: 'ask_user',
  description: 'Use this tool to ask the user one or more multiple-choice questions, with the goal of clarifying underspecified requirements, getting design feedback, or resolving ambiguity. Execution will pause until the user responds.',
  parameters: z.object({
    questions: z.array(z.object({
      question: z.string().describe('The question to ask the user.'),
      options: z.array(z.string()).describe('The text for each option. Must have at least 2 options.'),
      is_multi_select: z.boolean().describe('If true, the user can select multiple options.')
    }))
  })
}

let askResolver: ((answer: string) => void) | null = null

export function resolveAskUser(answer: string) {
  if (askResolver) {
    askResolver(answer)
    askResolver = null
  }
}

// Subscribe to ask user events so UI can show the prompt
export interface AskUserPayload {
  questions: { question: string; options: string[]; is_multi_select: boolean }[]
}

export type AskUserListener = (payload: AskUserPayload) => void
let listener: AskUserListener | null = null
export function setAskUserListener(cb: AskUserListener | null) {
  listener = cb
}

export async function executeAskUser(args: z.infer<typeof askUserDef.parameters>): Promise<string> {
  return new Promise((resolve) => {
    askResolver = resolve
    if (listener) {
      listener(args)
    } else {
      // Fallback if no UI is attached
      console.log(`[QA Tool] Agent asks: ${JSON.stringify(args.questions)}`)
    }
  })
}

registerTool(
  askUserDef.name,
  askUserDef.description,
  askUserDef.parameters,
  executeAskUser
)
