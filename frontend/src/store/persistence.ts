// ===== 后端持久化引擎（从 appStore.ts 抽出，A-7 阶段1）=====
// 业务数据 → /api/store（SQLite 资产库）；设置类 → /api/settings（server 本地 JSON）。
// 逐字搬迁、行为不变；appStore 仍 re-export 这些导出，保调用方零改动。
//
// 循环依赖说明：本模块 `import { useAppStore } from './appStore'`，但仅在函数体内（运行时）使用，
// 模块顶层不触发任何 store 读写——三套 subscribe 注册收敛到 registerPersisters()，由 appStore
// 末尾在 useAppStore 定义后调用。故 ESM 加载期 useAppStore 尚未求值无碍，运行时 binding 已就绪。

import { useAppStore } from './appStore'
import type { AppState } from './types'

// storeReady 门控：bootstrapStore 引导完成前，订阅与 pushXxxNow 都不写后端。
// 私有变量 + get/set 导出，供 bootstrap.ts 跨模块控制时序（删光不复活分支需临时置 false）。
let storeReady = false
export const getStoreReady = (): boolean => storeReady
export const setStoreReady = (v: boolean): void => { storeReady = v }

/** 业务数据载荷构造（12 个实体键）。导出供 backup.ts 组装备份 bundle 复用。 */
export const businessPayload = (s: AppState) => ({
  books: s.books,
  chapters: s.chapters,
  cards: s.cards,
  outline: s.outline,
  scenes: s.scenes,
  fragments: s.fragments,
  stateEvents: s.stateEvents,
  issues: s.issues,
  architectures: s.architectures,
  mergeCandidates: s.mergeCandidates,
  testHistory: s.testHistory,
  chatSessions: s.chatSessions,
})

/** 全局串行写入队列：确保 POST(upsert) 与 DELETE 按调用顺序执行，防止竞态复活。
 * 例如：大体积 POST（含 base64）in-flight 时用户点删除 → DELETE 先到 → 滞后 POST 后到 upsert 复活。 */
let storeWriteChain: Promise<void> = Promise.resolve()
const enqueueWrite = <T>(fn: () => Promise<T>): Promise<T> => {
  const p = storeWriteChain.then(fn, fn)
  storeWriteChain = p.then(() => {}, () => {})
  return p
}

/** 业务数据 upsert（POST /api/store）。导出供 bootstrapStore 首次播种复用。 */
export const pushStore = (payload: Record<string, unknown>) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 60000) // 60秒超时（增加到60秒）

  // 预先计算 JSON 大小，避免过大数据导致浏览器崩溃
  let jsonString: string
  try {
    jsonString = JSON.stringify(payload)
    const sizeInMB = new Blob([jsonString]).size / 1024 / 1024
    console.log(`[pushStore] 数据大小: ${sizeInMB.toFixed(2)} MB`)

    if (sizeInMB > 45) {
      console.warn(`[pushStore] 警告: 数据量过大 (${sizeInMB.toFixed(2)} MB)，可能导致失败`)
    }
  } catch (err) {
    console.error('[pushStore] JSON.stringify 失败:', err)
    throw new Error(`序列化数据失败：${err instanceof Error ? err.message : String(err)}`, { cause: err })
  }

  return enqueueWrite(() =>
    fetch('/api/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonString,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId))
  )
}

/** 显式删除请求（DELETE /api/store）。syncAll 已改为纯 upsert，删除走此端点。
 * keepalive:true：删除后立即 reload/关窗时，在途 DELETE 不被浏览器取消（body 仅 id，远小于 64KB 上限）。 */
const deleteStore = (deletes: Record<string, string[]>) =>
  enqueueWrite(() =>
    fetch('/api/store', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deletes),
      keepalive: true,
    })
  )

// 业务数据回写：仅在业务切片引用变化时 debounce POST（导入会话变动不触发）
let storeTimer: ReturnType<typeof setTimeout> | null = null

// 立即把当前业务状态推送到后端（绕过 1s 防抖）。用于删除/重置/**入库**等一次性关键操作：
// 点击即落库，不依赖 beforeunload（Electron 卸载时机不稳定，1s 内关窗会丢写入）。
// 导出供 Step4 入库等关键写操作立即落库（避免依赖 debounce 在关窗竞态下丢失）。
// 返回 Promise 以便调用方 await（入库前必须确认落库，再提示成功）。
// 注意：本函数 catch 吞错（fire-and-forget 安全），await 它**不能**判断写入是否成功——
// 失败也会 resolve。需要确认结果的关键写入请用 pushStoreNowChecked()。
export function pushStoreNow(): Promise<void> {
  if (!storeReady) return Promise.resolve()
  if (storeTimer) {
    clearTimeout(storeTimer)
    storeTimer = null
  }
  return pushStore(businessPayload(useAppStore.getState())).then(() => undefined).catch(() => {})
}

/**
 * 立即显式删除指定实体 id（DELETE /api/store）。fire-and-forget（吞错）。
 * 用途：deleteBook/deleteImage/resetDemo 等删除操作。syncAll 已改为纯 upsert（永不删除），
 * 故删除必须经此端点。
 */
export function pushDeleteNow(deletes: Record<string, string[]>): void {
  if (!storeReady) return
  if (Object.keys(deletes).length === 0) return
  // 不再静默吞错：CORS 拦截 / 网络失败等会让删除永不落库（曾因此"删除后重启复活"）。
  deleteStore(deletes).catch((err) => {
    console.warn('[pushDeleteNow] 删除请求失败，记录可能未从后端删除：', deletes, err)
  })
}

// 关键写入专用：与 pushStoreNow 同样绕防抖立即落库，但**失败抛错**（不吞），供 await + try/catch。
// 用途：入库等一次性关键写——后端 413（body 超限）/ 5xx / 网络断 等会抛错，避免 message.success 误报。
export async function pushStoreNowChecked(): Promise<void> {
  if (!storeReady) throw new Error('数据层尚未就绪，请稍候重试')
  if (storeTimer) {
    clearTimeout(storeTimer)
    storeTimer = null
  }

  let res: Response
  try {
    res = await pushStore(businessPayload(useAppStore.getState()))
  } catch (err) {
    // 网络错误、超时、序列化失败等
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new Error('请求超时（超过 60 秒），数据量可能过大。建议分批入库或清理旧数据。', { cause: err })
      }
      throw new Error(`网络请求失败：${err.message}`, { cause: err })
    }
    throw new Error(`未知错误：${String(err)}`, { cause: err })
  }

  if (!res.ok) {
    // 解析后端错误信息（Fastify 413/500 等返回 {message:...}），附 HTTP 状态码
    const txt = await res.text().catch(() => '')
    let detail = `HTTP ${res.status}`
    try {
      const j = JSON.parse(txt) as { message?: string; error?: string }
      if (j.message) detail += `：${j.message}`
      else if (j.error) detail += `：${j.error}`
    } catch {
      if (txt) detail += `：${txt.slice(0, 200)}`
    }
    throw new Error(`写入后端失败（${detail}）`)
  }
}

// 设置回写：settingsPayload 任一键引用变化时 debounce POST（registerPersisters 从该键集自动比较）
/** 设置载荷构造（单一真相：脏检查键集与 backup.ts 备份均从此派生，加字段只改这里）。 */
export const settingsPayload = (s: AppState) => ({
  providers: s.providers,
  moduleMapping: s.moduleMapping,
  m1SystemPrompt: s.m1SystemPrompt,
  assetDir: s.assetDir,
  currentBookId: s.currentBookId,
  nodeTestGlobalForm: s.nodeTestGlobalForm,
  nodeTestFormPerNode: s.nodeTestFormPerNode,
  showMenuBar: s.showMenuBar,
  splitPatterns: s.splitPatterns,
  cleanNodeOverrides: s.cleanNodeOverrides,
  m1AutoRetry: s.m1AutoRetry,
  m1TitleTemplate: s.m1TitleTemplate,
  m1TestText: s.m1TestText,
  theme: s.theme,
  enable4KScale: s.enable4KScale,
  scaleBaseWidth: s.scaleBaseWidth,
  nodeGroupExpanded: s.nodeGroupExpanded,
  systemPromptPresets: s.systemPromptPresets,
  systemPromptActiveId: s.systemPromptActiveId,
  imageArchiveDir: s.imageArchiveDir,
  roleChatAutoConfig: s.roleChatAutoConfig,
  m2CardGenPromptByType: s.m2CardGenPromptByType,
  promptOverrides: s.promptOverrides,
})

let settingsTimer: ReturnType<typeof setTimeout> | null = null

// 立即把当前设置推送到后端（绕过 1s 防抖）。用于 splitPatterns 编辑/恢复/备份导入等关键操作。
// 导出供 backup.ts 复用。
export function pushSettingsNow(): void {
  if (!storeReady) return
  if (settingsTimer) {
    clearTimeout(settingsTimer)
    settingsTimer = null
  }
  fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settingsPayload(useAppStore.getState())),
  }).catch(() => {})
}

// M1 导入会话持久化：importSession 变化时 debounce POST，退出/刷新不丢清理进度
let importSessionTimer: ReturnType<typeof setTimeout> | null = null

/** 立即推送当前 importSession 到后端（关窗时绕过 debounce） */
export function pushImportSessionNow(): void {
  if (!storeReady) return
  if (importSessionTimer) {
    clearTimeout(importSessionTimer)
    importSessionTimer = null
  }
  const ses = useAppStore.getState().importSession
  if (!ses) {
    fetch('/api/import-session', { method: 'DELETE', keepalive: true }).catch(() => {})
    return
  }
  fetch('/api/import-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ses),
    keepalive: true,
  }).catch(() => {})
}

// 关窗/退出时立即冲刷未提交的 debounce 写入。
// 业务数据写入有 1s debounce，若用户删除后立刻关窗，定时器未触发 → 后端拿不到删除 → 重启后数据回归。
// beforeunload 用 keepalive:true 让请求能熬过页面卸载，确保最后一次状态落库。
export async function flushStoreWrites(): Promise<void> {
  if (storeTimer) {
    clearTimeout(storeTimer)
    storeTimer = null
  }
  if (settingsTimer) {
    clearTimeout(settingsTimer)
    settingsTimer = null
  }
  if (importSessionTimer) {
    clearTimeout(importSessionTimer)
    importSessionTimer = null
  }
  const st = useAppStore.getState()
  await Promise.all([
    fetch('/api/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(businessPayload(st)),
      keepalive: true,
    }).catch(() => {}),
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsPayload(st)),
      keepalive: true,
    }).catch(() => {}),
    (async () => {
      if (!st.importSession) {
        await fetch('/api/import-session', { method: 'DELETE', keepalive: true }).catch(() => {})
        return
      }
      await fetch('/api/import-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(st.importSession),
        keepalive: true,
      }).catch(() => {})
    })(),
  ])
}

/**
 * 注册三套持久化订阅 + 关窗冲刷监听。由 appStore.ts 在 useAppStore 定义后调用一次。
 * （从 appStore.ts 模块顶层即时注册改为显式函数，以解循环依赖——见文件头说明。）
 * guard 防重复注册（防御性：正常仅 appStore 末尾调用一次）。
 */
let registered = false
export function registerPersisters(): void {
  if (registered) return
  registered = true

  // 脏检查键集：以 payload 的键为单一真相——加字段只改 payload 一处，下面的比较自动跟随。
  // 根治"新增设置字段漏写 === 比较 → 改了不落库"（roleChatAutoConfig 曾因此漏写、重启即丢）。
  // 在函数内（非模块顶层）求值：registerPersisters 由 appStore 末尾在 useAppStore 定义后调用，
  // 此刻 getState() 已就绪，不触发文件头所述循环依赖。
  const BUSINESS_KEYS = Object.keys(businessPayload(useAppStore.getState())) as (keyof AppState)[]
  const SETTINGS_KEYS = Object.keys(settingsPayload(useAppStore.getState())) as (keyof AppState)[]

  // 业务数据回写：仅在业务切片引用变化时 debounce POST（导入会话变动不触发）
  useAppStore.subscribe((s, prev) => {
    if (!storeReady) return
    if (BUSINESS_KEYS.every((k) => s[k] === prev[k])) return
    if (storeTimer) clearTimeout(storeTimer)
    storeTimer = setTimeout(() => {
      pushStore(businessPayload(useAppStore.getState())).catch(() => {})
    }, 1000)
  })

  // 设置回写
  useAppStore.subscribe((s, prev) => {
    if (!storeReady) return
    if (SETTINGS_KEYS.every((k) => s[k] === prev[k])) return
    if (settingsTimer) clearTimeout(settingsTimer)
    settingsTimer = setTimeout(() => {
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsPayload(useAppStore.getState())),
      }).catch(() => {})
    }, 1000)
  })

  // M1 导入会话持久化：importSession 变化时 debounce POST，退出/刷新不丢清理进度
  useAppStore.subscribe((s, prev) => {
    if (!storeReady) return
    if (s.importSession === prev.importSession) return
    if (importSessionTimer) clearTimeout(importSessionTimer)
    if (!s.importSession) {
      fetch('/api/import-session', { method: 'DELETE', keepalive: true }).catch(() => {})
      return
    }
    importSessionTimer = setTimeout(() => {
      fetch('/api/import-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(useAppStore.getState().importSession),
      }).catch(() => {})
    }, useAppStore.getState().cleanRun?.running ? 8000 : 1500)
  })

  if (typeof window !== 'undefined') {
    // 页面卸载前尽力冲刷（fire-and-forget，靠 keepalive 续命）
    window.addEventListener('beforeunload', () => {
      void flushStoreWrites()
    })
    window.addEventListener('pagehide', () => {
      void flushStoreWrites()
    })
  }
}
