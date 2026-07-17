import { useEffect, useMemo, useState } from 'react'
import { useSettingsStore } from '../stores/settings.store'
import { ipc } from '../lib/ipc'

export interface ModelGate {
  locked: boolean
  reason?: string
  pluginId: string
  actionId?: string
}

/**
 * useModelPool — tek model havuzu, tüm picker yüzeyleri için.
 *
 * Ana uygulamadaki picker'lar (InputArea, ProjectHome) kayıtlı modellerin
 * yanında plugin'lerin katkı verdiği modelleri de gösterir; Design yüzeyi
 * yalnız savedModels okuyordu ve havuzlar ayrışıyordu. Bu hook aynı birleşimi
 * (saved ∪ plugin, saved önce, dedupe) ve kilit (gate) bilgisini her yüzeye verir.
 *
 * @param refreshKey  Picker açıldığında değişen bir değer geçin (ör. open state)
 *                    — plugin modelleri/gate'ler o anda tazelenir.
 */
export function useModelPool(refreshKey?: unknown) {
  const { savedModels } = useSettingsStore()
  const [pluginModels, setPluginModels] = useState<string[]>([])
  const [modelGates, setModelGates] = useState<Record<string, ModelGate>>({})
  const [unlockingModel, setUnlockingModel] = useState<string | null>(null)

  useEffect(() => {
    ipc.plugins.models?.().then(m => setPluginModels(Array.isArray(m) ? m : [])).catch(() => {})
    ipc.plugins.modelGates?.().then(g => setModelGates((g as Record<string, ModelGate>) || {})).catch(() => {})
  }, [refreshKey])

  const displayModels = useMemo(
    () => [...new Set([...savedModels, ...pluginModels])],
    [savedModels, pluginModels],
  )

  /**
   * Kilitli plugin modeli için gate aksiyonunu (ör. Sign-in) çalıştırır.
   * Gate temizlendiyse true döner — çağıran taraf modeli seçebilir.
   */
  async function unlockModel(modelId: string): Promise<boolean> {
    const gate = modelGates[modelId]
    if (!gate?.actionId) return false
    setUnlockingModel(modelId)
    try {
      const res = await ipc.plugins.runAction(gate.pluginId, gate.actionId)
      const fresh: Record<string, ModelGate> =
        ((await ipc.plugins.modelGates?.().catch(() => ({}))) as Record<string, ModelGate>) || {}
      setModelGates(fresh)
      return !!res?.ok && !fresh[modelId]?.locked
    } finally {
      setUnlockingModel(null)
    }
  }

  return { displayModels, modelGates, unlockingModel, unlockModel }
}
