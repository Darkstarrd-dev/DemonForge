/**
 * 备份/恢复工具 —— 设置导入导出 + 完整备份恢复。
 *
 * 设计目标（对应持久化加固方案的 Part B）：
 * 1. **版本化**：bundle 带 version 字段，旧版经 migrateBundle 迁移；未知字段忽略不报错。
 * 2. **向后兼容**：导入旧版/缺键/坏条目数据不报错——parseBundle 尽力解析，逐项 try/catch，
 *    把可恢复的问题记入 warnings 供 UI 展示，只对"根本不是 JSON"才抛致命错。
 * 3. **脱敏选项**：导出时可选择抹除 apiKey（分享/迁移场景），导入侧原样接受。
 * 4. **纯函数**：组装/解析/脱敏/迁移均无副作用、不碰 store，便于单测（backup-smoke.mts）。
 *    只有 downloadBundle / readFileAsText 涉及 DOM（浏览器 API）。
 *
 * bundle 格式（两种用途同一 schema，靠 kind 区分）：
 *   { version:1, exportedAt, app:'novelhelper', kind:'settings'|'full',
 *     settings:{providers, moduleMapping, ...}, business?:{books, chapters, ...} }
 */
import type {
  Book,
  Chapter,
  EntityCard,
  OutlineNode,
  SimScene,
  SimFragment,
  StateEvent,
  ConsistencyIssue,
  NovelArchitecture,
  MergeCandidate,
  GeneratedImage,
  ProviderNode,
  ModuleKey,
  ModuleModelMapping,
  SplitPattern,
} from '../services/types'
import { normalizeProvider } from './provider'
import { DEFAULT_SPLIT_PATTERNS } from './split'
import { seedModuleMapping } from '../mocks/seed'

/** 文生图 Demo 表单结构（与 appStore.ImageDemoForm 对齐）。 */
export interface ImageDemoForm {
  provider: string
  nodeId?: string
  prompt: string
  resolution: string
  negativePrompt?: string
  steps?: number
  guidance?: number
  seed?: number
  imageInputMode?: 'base64' | 'catbox' | 'litterbox' | '0x0' | 'telegraph'
}

/** 当前 bundle 格式版本。未来字段重命名/结构调整时递增，并在 migrateBundle 加降级分支。 */
export const BUNDLE_VERSION = 1

/** settings.json 中由前端管理的键（排除 storeInitialized/embeddingDim 等后端内部字段）。 */
export interface SettingsPayload {
  providers?: ProviderNode[]
  moduleMapping?: Record<ModuleKey, ModuleModelMapping>
  m1SystemPrompt?: string
  assetDir?: string
  currentBookId?: string
  imageDemoForm?: ImageDemoForm
  imageDemoGlobalForm?: { provider: string; nodeId?: string }
  imageDemoFormPerNode?: Record<string, Partial<ImageDemoForm>>
  showMenuBar?: boolean
  splitPatterns?: SplitPattern[]
  cleanNodeOverrides?: Record<string, Partial<{ participating: boolean; concurrency: number; batchSize: number; intervalSec: number }>>
  m1AutoRetry?: boolean
  m1TitleTemplate?: string
  m1TestText?: string
}

/** 全部业务数据键（与 appStore businessPayload 对齐）。 */
export interface BusinessPayload {
  books?: Book[]
  chapters?: Chapter[]
  cards?: EntityCard[]
  outline?: OutlineNode[]
  scenes?: SimScene[]
  fragments?: SimFragment[]
  stateEvents?: StateEvent[]
  issues?: ConsistencyIssue[]
  architectures?: NovelArchitecture[]
  mergeCandidates?: MergeCandidate[]
  imageGallery?: GeneratedImage[]
}

export type BundleKind = 'settings' | 'full'

export interface BackupBundle {
  version: number
  exportedAt: string
  app: 'novelhelper'
  kind: BundleKind
  settings: SettingsPayload
  business?: BusinessPayload
}

/** 业务实体的所有合法键（导入时按此白名单过滤，忽略未知键）。 */
export const BUSINESS_KEYS = [
  'books', 'chapters', 'cards', 'outline', 'scenes', 'fragments',
  'stateEvents', 'issues', 'architectures', 'mergeCandidates', 'imageGallery',
] as const

/** settings 的所有合法键（导入时按此白名单过滤）。 */
export const SETTINGS_KEYS = [
  'providers', 'moduleMapping', 'm1SystemPrompt', 'assetDir',
  'currentBookId', 'imageDemoForm', 'imageDemoGlobalForm', 'imageDemoFormPerNode',
  'showMenuBar', 'splitPatterns', 'cleanNodeOverrides',
  'm1AutoRetry', 'm1TitleTemplate', 'm1TestText',
] as const

/**
 * 组装备份 bundle（纯函数）。
 * @param kind 'settings' 仅设置 / 'full' 设置+业务数据
 * @param settings 设置载荷（通常来自 settingsPayload(state)）
 * @param business 业务载荷（kind='full' 时必传；'settings' 时忽略）
 * @param redactApiKeys true 则 providers[].apiKey 抹空
 */
export function buildBundle(
  kind: BundleKind,
  settings: SettingsPayload,
  business: BusinessPayload | null,
  redactApiKeys: boolean,
): BackupBundle {
  const settingsCopy: SettingsPayload = { ...settings }
  if (redactApiKeys && Array.isArray(settingsCopy.providers)) {
    settingsCopy.providers = settingsCopy.providers.map((p) => ({ ...p, apiKey: '' }))
  }
  const bundle: BackupBundle = {
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'novelhelper',
    kind,
    settings: settingsCopy,
  }
  if (kind === 'full' && business) {
    bundle.business = { ...business }
  }
  return bundle
}

/**
 * 迁移 bundle 到当前版本（纯函数，预留）。
 * 当前 BUNDLE_VERSION=1，无历史版本需迁移；此函数为未来 v2→v1 降级提供挂载点。
 * 未知/更高版本：原样返回（导入侧只读已知字段，多余字段自然被忽略）。
 */
export function migrateBundle(bundle: BackupBundle): BackupBundle {
  // 未来版本迁移示例：
  // if (bundle.version < 2) { /* 字段重命名等 */ bundle = { ...bundle, version: 2 } }
  return bundle
}

export interface ParseResult {
  /** 解析成功得到的 bundle（已迁移到当前版本结构）。致命错误时为 null。 */
  bundle: BackupBundle | null
  /** 非致命问题清单（缺键/坏条目/版本异常等），UI 在预览 Modal 展示，不阻断导入。 */
  warnings: string[]
  /** 致命错误（根本不是 JSON / 结构完全不对）。致命时 bundle=null，UI 应阻止导入。 */
  fatal: string | null
}

/**
 * 解析导入文件内容为 bundle（纯函数，容错核心）。
 *
 * 容错策略（满足"旧数据导入不报错"需求）：
 * - 非 JSON / JSON 非对象 → fatal（阻断）。
 * - 缺 version → 当 v0，warning。
 * - app 非 novelhelper → warning 但允许导入。
 * - settings 缺键 → 用默认补；providers 每条单独 try/catch，坏条目跳过记 warning。
 * - moduleMapping 与 seedModuleMapping 合并补全新 ModuleKey。
 * - splitPatterns 确保 'custom' 存在。
 * - business 缺某类 → 置 undefined；多余键忽略。
 */
export function parseBundle(raw: string): ParseResult {
  const warnings: string[] = []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return { bundle: null, warnings, fatal: `文件不是有效的 JSON：${String(err)}` }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { bundle: null, warnings, fatal: '文件内容不是 JSON 对象' }
  }
  const obj = parsed as Record<string, unknown>

  // 兼容"裸 settings.json"旧格式：无 version/app/kind 字段但有 providers/moduleMapping 等键
  const looksLikeBareSettings =
    obj.version === undefined &&
    (obj.providers !== undefined || obj.moduleMapping !== undefined)
  if (looksLikeBareSettings) {
    warnings.push('检测到旧版裸 settings.json 格式（无 bundle 包装），已自动适配。')
    const bundle: BackupBundle = {
      version: 0,
      exportedAt: '',
      app: 'novelhelper',
      kind: 'settings',
      settings: normalizeSettings(obj, warnings),
    }
    return { bundle: migrateBundle(bundle), warnings, fatal: null }
  }

  const version = typeof obj.version === 'number' ? obj.version : -1
  if (version < 0) {
    warnings.push('未检测到 version 字段，按旧版处理。')
  } else if (version > BUNDLE_VERSION) {
    warnings.push(`bundle 版本 v${version} 高于当前支持 v${BUNDLE_VERSION}，多余字段将被忽略。`)
  }
  const app = typeof obj.app === 'string' ? obj.app : ''
  if (app && app !== 'novelhelper') {
    warnings.push(`app 字段为 "${app}"（非 novelhelper），仍尝试导入。`)
  }
  const kindRaw = obj.kind
  const kind: BundleKind = kindRaw === 'full' ? 'full' : 'settings'
  if (kindRaw !== 'settings' && kindRaw !== 'full') {
    warnings.push(`kind 字段缺失或异常（"${String(kindRaw)}"），按 settings 处理。`)
  }

  const settingsRaw = (obj.settings && typeof obj.settings === 'object' ? obj.settings : {}) as Record<string, unknown>
  const settings = normalizeSettings(settingsRaw, warnings)

  let business: BusinessPayload | undefined
  if (kind === 'full') {
    const bizRaw = (obj.business && typeof obj.business === 'object' ? obj.business : {}) as Record<string, unknown>
    business = normalizeBusiness(bizRaw, warnings)
  }

  const bundle: BackupBundle = {
    version: version < 0 ? 0 : version,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
    app: 'novelhelper',
    kind,
    settings,
    business,
  }
  return { bundle: migrateBundle(bundle), warnings, fatal: null }
}

/** 规范化 settings：按白名单取键 + 逐项容错补默认。 */
function normalizeSettings(raw: Record<string, unknown>, warnings: string[]): SettingsPayload {
  const out: SettingsPayload = {}
  if (Array.isArray(raw.providers)) {
    const providers: ProviderNode[] = []
    raw.providers.forEach((p, i) => {
      if (!p || typeof p !== 'object') {
        warnings.push(`providers 第 ${i + 1} 项不是对象，已跳过。`)
        return
      }
      const item = p as Record<string, unknown>
      // normalizeProvider 要求至少有 id/name/baseURL/model 四个核心字段
      if (typeof item.id !== 'string' || typeof item.name !== 'string' ||
          typeof item.baseURL !== 'string' || typeof item.model !== 'string') {
        warnings.push(`providers 第 ${i + 1} 项缺少核心字段(id/name/baseURL/model)，已跳过。`)
        return
      }
      try {
        providers.push(normalizeProvider(item as Parameters<typeof normalizeProvider>[0]))
      } catch (err) {
        warnings.push(`providers 第 ${i + 1} 项规范化失败：${String(err)}，已跳过。`)
      }
    })
    out.providers = providers
  }
  if (raw.moduleMapping && typeof raw.moduleMapping === 'object') {
    // 与 seedModuleMapping 合并，确保新增的 ModuleKey 有默认值（向后兼容）
    out.moduleMapping = { ...seedModuleMapping, ...(raw.moduleMapping as Record<ModuleKey, ModuleModelMapping>) }
  }
  if (typeof raw.m1SystemPrompt === 'string') out.m1SystemPrompt = raw.m1SystemPrompt
  if (typeof raw.assetDir === 'string') {
    // assetDir 是绝对路径，导入另一台机器时多半无效 → 不强制清空，仅记 warning（用户可在设置页改）
    if (raw.assetDir.trim()) {
      warnings.push('assetDir 是来源机器的绝对路径，当前机器可能无效，请在设置页确认或清空。')
    }
    out.assetDir = raw.assetDir
  }
  if (typeof raw.currentBookId === 'string') out.currentBookId = raw.currentBookId
  if (raw.imageDemoForm && typeof raw.imageDemoForm === 'object') {
    out.imageDemoForm = raw.imageDemoForm as ImageDemoForm
  }
  if (raw.imageDemoGlobalForm && typeof raw.imageDemoGlobalForm === 'object') {
    out.imageDemoGlobalForm = raw.imageDemoGlobalForm as { provider: string; nodeId?: string }
  }
  if (raw.imageDemoFormPerNode && typeof raw.imageDemoFormPerNode === 'object') {
    out.imageDemoFormPerNode = raw.imageDemoFormPerNode as Record<string, Partial<ImageDemoForm>>
  }
  if (typeof raw.showMenuBar === 'boolean') out.showMenuBar = raw.showMenuBar
  if (Array.isArray(raw.splitPatterns)) {
    const patterns: SplitPattern[] = []
    raw.splitPatterns.forEach((p) => {
      if (p && typeof p === 'object' && typeof (p as SplitPattern).key === 'string') {
        patterns.push(p as SplitPattern)
      }
    })
    // 确保 'custom' 永在（与 bootstrapStore 一致）
    if (!patterns.some((p) => p.key === 'custom')) {
      patterns.push({ key: 'custom', label: '自定义正则', regex: '', builtin: true })
    }
    out.splitPatterns = patterns
  } else {
    out.splitPatterns = DEFAULT_SPLIT_PATTERNS.map((p) => ({ ...p }))
  }
  if (raw.cleanNodeOverrides && typeof raw.cleanNodeOverrides === 'object') {
    out.cleanNodeOverrides = raw.cleanNodeOverrides as Record<string, Partial<{ participating: boolean; concurrency: number; batchSize: number; intervalSec: number }>>
  }
  if (typeof raw.m1AutoRetry === 'boolean') out.m1AutoRetry = raw.m1AutoRetry
  if (typeof raw.m1TitleTemplate === 'string') out.m1TitleTemplate = raw.m1TitleTemplate
  if (typeof raw.m1TestText === 'string') out.m1TestText = raw.m1TestText
  return out
}

/** 规范化 business：按白名单取键，单类非数组跳过。 */
function normalizeBusiness(raw: Record<string, unknown>, warnings: string[]): BusinessPayload {
  const out: BusinessPayload = {}
  for (const key of BUSINESS_KEYS) {
    const val = raw[key]
    if (Array.isArray(val)) {
      // 过滤掉非对象项，避免脏数据
      const cleaned = val.filter((x) => x && typeof x === 'object')
      if (cleaned.length !== val.length) {
        warnings.push(`业务数据 ${key} 有 ${val.length - cleaned.length} 项非对象，已剔除。`)
      }
      ;(out as Record<string, unknown[]>)[key] = cleaned
    } else if (val !== undefined) {
      warnings.push(`业务数据 ${key} 不是数组，已忽略。`)
    }
  }
  return out
}

/** bundle 业务数据各类计数（UI 预览用）。 */
export function summarizeBusiness(b: BusinessPayload | undefined): Record<string, number> {
  if (!b) return {}
  const summary: Record<string, number> = {}
  for (const key of BUSINESS_KEYS) {
    const arr = b[key]
    summary[key] = Array.isArray(arr) ? arr.length : 0
  }
  return summary
}

// ===== 浏览器 API（仅 UI 层调用，单测不触及）=====

/** 触发浏览器下载 bundle 文件。 */
export function downloadBundle(bundle: BackupBundle, filename: string): void {
  const json = JSON.stringify(bundle, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 延迟 revoke，给浏览器下载启动时间
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 读 File 为文本（Promise 包装）。 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsText(file, 'utf-8')
  })
}

/** 生成带日期的备份文件名。 */
export function backupFilename(kind: BundleKind, redacted: boolean): string {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const tag = redacted ? '-redacted' : ''
  return `novelhelper-${kind}${tag}-${ymd}.json`
}
