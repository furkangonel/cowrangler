import { useEffect, useState } from 'react'
import { ipc } from './ipc'
import type { UpdateStatus } from './ipc'

/** Subscribe first, then hydrate from the main-process snapshot without
 * overwriting an event that arrives while the snapshot request is in flight. */
export function useUpdateStatus(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    let alive = true
    let receivedEvent = false
    const off = ipc.updates.onStatus((next) => {
      receivedEvent = true
      if (alive) setStatus(next)
    })
    void ipc.updates.getStatus()
      .then((snapshot) => {
        if (alive && !receivedEvent) setStatus(snapshot)
      })
      .catch(() => {})
    return () => {
      alive = false
      off()
    }
  }, [])

  return status
}
