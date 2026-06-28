/**
 * 提示词覆盖归一化 hook（P3 地基）。
 *
 * 统一各模块「编辑提示词」的取默认 / 持久化覆盖 / 发送时覆盖逻辑：
 * - 取默认：GET /api/llm/prompt/:key（后端 PROMPT_REGISTRY）
 * - 取覆盖：读 store.promptOverrides[storageKey]
 * - save(v)：写 store.promptOverrides（持久化到 settings.json）
 * - reset()：删 store.promptOverrides[storageKey]
 *
 * `storageKey` 规则：
 * - 无类型分支的提示词：即 promptKey（如 'm0-arch'）
 * - 按类型分支的（如 M2 单卡）：`${promptKey}:${type}`（如 'm2-card-single:character'）
 */
import { useState, useEffect, useCallback } from 'react'
import { useAppStore, pushSettingsNow } from '../store/appStore'

export interface PromptOverrideState {
  /** 后端默认提示词（加载中为空串）。 */
  defaultValue: string
  /** 当前生效值（覆盖优先于默认）。 */
  currentValue: string
  /** 是否已加载默认值。 */
  defaultLoaded: boolean
  /** 是否有用户覆盖（脏态）。 */
  isDirty: boolean
  /** 保存覆盖（持久化）。 */
  save: (v: string) => void
  /** 重置为默认（删覆盖）。 */
  reset: () => void
}

export function usePromptOverride(promptKey: string, type?: string): PromptOverrideState {
  const promptOverrides = useAppStore((s) => s.promptOverrides)
  const setState = useAppStore((s) => s.setState)
  const storageKey = type ? `${promptKey}:${type}` : promptKey

  const [defaultValue, setDefaultValue] = useState('')
  const [defaultLoaded, setDefaultLoaded] = useState(false)

  // 加载后端默认提示词
  useEffect(() => {
    let cancelled = false
    fetch(`/api/llm/prompt/${encodeURIComponent(promptKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.prompt) {
          setDefaultValue(data.prompt)
          setDefaultLoaded(true)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [promptKey])

  const currentValue = promptOverrides[storageKey] ?? defaultValue
  const isDirty = Boolean(promptOverrides[storageKey])

  const save = useCallback((v: string) => {
    setState({ promptOverrides: { ...useAppStore.getState().promptOverrides, [storageKey]: v } })
    pushSettingsNow()
  }, [setState, storageKey])

  const reset = useCallback(() => {
    const next = { ...useAppStore.getState().promptOverrides }
    delete next[storageKey]
    setState({ promptOverrides: next })
    pushSettingsNow()
  }, [setState, storageKey])

  return { defaultValue, currentValue, defaultLoaded, isDirty, save, reset }
}