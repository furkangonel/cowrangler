export type UpdateOperation = 'check' | 'download' | 'install'

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string; notes?: string }
  | { state: 'not-available'; version: string; checkedAt: number }
  | { state: 'progress'; version?: string; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; operation: UpdateOperation; message: string }

export type UpdateActionResult = {
  ok: boolean
  version?: string
  reason?: 'dev' | 'not-available' | 'not-downloaded' | 'busy'
  error?: string
}
