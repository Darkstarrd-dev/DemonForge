// ===== 启动引导（从 appStore.ts 抽出，A-7 阶段1）=====
// 先拉设置，再拉业务数据；后端为空且从未初始化过才用种子播种。逐字搬迁、行为不变。
// storeReady 的读写经 persistence 的 setStoreReady（跨模块共享门控）。

import type {
  Book,
  Chapter,
  EntityCard,
  OutlineNode,
  SimScene,
  SimFragment,
  StateEvent,
  ConsistencyIssue,
  ProviderNode,
  ModuleKey,
  ModuleModelMapping,
  MergeCandidate,
  NovelArchitecture,
  TestHistoryItem,
  ChatSession,
  SplitPattern,
  RoleChatAutoConfig,
} from '../services/types'
import {
  seedModuleMapping,
  seedBooks,
  seedChapters,
  seedCards,
  seedOutline,
  seedScenes,
  seedFragments,
  seedStateEvents,
  seedIssues,
  seedArchitectures,
  seedMergeCandidates,
} from '../mocks/seed'
import { normalizeProvider } from '../utils/provider'
import { useAppStore } from './appStore'
import type { AppState, ImageDemoForm, NodeTestForm, SystemPromptPreset } from './types'
import { pushStore, setStoreReady } from './persistence'
import { defaultRoleChatAutoConfig } from './slices/roleChatSlice'

/** 启动引导：先拉设置，再拉业务数据；后端为空且从未初始化过才用种子播种。 */
export async function bootstrapStore(): Promise<void> {
  // 标记业务库是否已初始化过。用于区分「首次运行（后端为空→播种）」与
  // 「用户清空了全部书（后端为空但已初始化→保持空，不再回填种子）」。
  let storeInitialized = false
  try {
    const res = await fetch('/api/settings')
    if (res.ok) {
      const d = (await res.json()) as {
        providers?: ProviderNode[]
        moduleMapping?: Record<ModuleKey, ModuleModelMapping>
        m1SystemPrompt?: string
        assetDir?: string
        currentBookId?: string
        storeInitialized?: boolean
        imageDemoForm?: ImageDemoForm
        imageDemoGlobalForm?: { provider: string; nodeId?: string }
        roleChatAutoConfig?: RoleChatAutoConfig
        imageDemoFormPerNode?: Record<string, Partial<ImageDemoForm>>
        nodeTestGlobalForm?: { provider: string; nodeId?: string }
        nodeTestFormPerNode?: Record<string, Partial<NodeTestForm>>
        showMenuBar?: boolean
        splitPatterns?: SplitPattern[]
        cleanNodeOverrides?: Record<string, Partial<{ participating: boolean; concurrency: number; batchSize: number; intervalSec: number }>>
        m1AutoRetry?: boolean
        m1TitleTemplate?: string
        m1TestText?: string
        theme?: 'light' | 'dark'
        enable4KScale?: boolean
        scaleBaseWidth?: number
        nodeGroupExpanded?: Record<string, boolean>
        systemPromptPresets?: SystemPromptPreset[]
        systemPromptActiveId?: string | null
        imageArchiveDir?: string
      }
      storeInitialized = d.storeInitialized === true
      const patch: Partial<AppState> = {}
      if (d.providers?.length) patch.providers = d.providers.map((p) => normalizeProvider(p))
      // 合并 seed 默认键，防旧 settings.json 缺新增 ModuleKey 导致 Record 不全
      if (d.moduleMapping) patch.moduleMapping = { ...seedModuleMapping, ...d.moduleMapping }
      if (typeof d.m1SystemPrompt === 'string') patch.m1SystemPrompt = d.m1SystemPrompt
      if (typeof d.assetDir === 'string') patch.assetDir = d.assetDir
      if (typeof d.showMenuBar === 'boolean') patch.showMenuBar = d.showMenuBar
      if (typeof d.currentBookId === 'string' && d.currentBookId) patch.currentBookId = d.currentBookId
      // 节点测试表单：优先新结构（nodeTestGlobalForm），兼容旧 imageDemoForm/imageDemoGlobalForm 自动迁移
      if (d.nodeTestGlobalForm && typeof d.nodeTestGlobalForm === 'object')
        patch.nodeTestGlobalForm = { ...useAppStore.getState().nodeTestGlobalForm, ...d.nodeTestGlobalForm }
      else if (d.imageDemoGlobalForm && typeof d.imageDemoGlobalForm === 'object')
        patch.nodeTestGlobalForm = { ...useAppStore.getState().nodeTestGlobalForm, ...d.imageDemoGlobalForm }
      if (d.nodeTestFormPerNode && typeof d.nodeTestFormPerNode === 'object')
        patch.nodeTestFormPerNode = d.nodeTestFormPerNode
      else if (d.imageDemoFormPerNode && typeof d.imageDemoFormPerNode === 'object')
        patch.nodeTestFormPerNode = d.imageDemoFormPerNode
      // 旧 settings.json 只有 imageDemoForm 时自动迁移到新结构
      if (d.imageDemoForm && typeof d.imageDemoForm === 'object' && !d.nodeTestFormPerNode && !d.imageDemoFormPerNode) {
        const { nodeId, provider, ...params } = d.imageDemoForm
        patch.nodeTestGlobalForm = { provider: provider || 'modelscope', nodeId }
        patch.nodeTestFormPerNode = nodeId ? { [nodeId]: params } : {}
      }
      // 章节检测模式池（旧 settings.json 无此键则沿用内置默认池；确保 custom 永在）
      if (Array.isArray(d.splitPatterns) && d.splitPatterns.length) {
        const hasCustom = d.splitPatterns.some((p) => p.key === 'custom')
        patch.splitPatterns = hasCustom ? d.splitPatterns : [...d.splitPatterns, { key: 'custom', label: '自定义正则', regex: '', builtin: true }]
      }
      // M1 Step3 清理节点覆盖（旧 settings.json 无此键则沿用空对象）
      if (d.cleanNodeOverrides && typeof d.cleanNodeOverrides === 'object') {
        patch.cleanNodeOverrides = d.cleanNodeOverrides
      }
      // M1 Step3 失败章节自动重试开关（旧 settings.json 无此键则默认 true）
      if (typeof d.m1AutoRetry === 'boolean') patch.m1AutoRetry = d.m1AutoRetry
      // M1 Step2 章节标题模板（旧 settings.json 无此键则默认 "第{0n}章 {title}"）
      if (typeof d.m1TitleTemplate === 'string') patch.m1TitleTemplate = d.m1TitleTemplate
      // M1 测试文本（旧 settings.json 无此键则沿用 seed 默认样本）
      if (typeof d.m1TestText === 'string') patch.m1TestText = d.m1TestText
      // 角色交流自动循环配置（旧 settings.json 无此键则沿用 seed 默认）
      if (d.roleChatAutoConfig && typeof d.roleChatAutoConfig === 'object') {
        patch.roleChatAutoConfig = { ...defaultRoleChatAutoConfig, ...d.roleChatAutoConfig }
      }
      // 主题配置（旧 settings.json 无此键则默认 light）
      if (d.theme === 'light' || d.theme === 'dark') patch.theme = d.theme
      // 4K 基准缩放开关与基准宽度（旧实现遗漏回载，导致开关重启即丢；此处补回）
      if (typeof d.enable4KScale === 'boolean') patch.enable4KScale = d.enable4KScale
      if (typeof d.scaleBaseWidth === 'number') patch.scaleBaseWidth = d.scaleBaseWidth
      // 节点池分组折叠状态（旧 settings.json 无此键则默认空对象）
      if (d.nodeGroupExpanded && typeof d.nodeGroupExpanded === 'object') patch.nodeGroupExpanded = d.nodeGroupExpanded
      // 节点测试 System Prompt 预设列表与当前激活 id（旧 settings.json 无此键则沿用空数组+null）
      if (Array.isArray(d.systemPromptPresets)) patch.systemPromptPresets = d.systemPromptPresets
      if (d.systemPromptActiveId === null || typeof d.systemPromptActiveId === 'string') {
        patch.systemPromptActiveId = d.systemPromptActiveId
      }
      // 图片归档目录（旧 settings.json 无此键则沿用空串，后端用默认 <dataDir>/images）
      if (typeof d.imageArchiveDir === 'string') patch.imageArchiveDir = d.imageArchiveDir
      if (Object.keys(patch).length) useAppStore.setState(patch)
    }
  } catch {
    /* 后端不可用：沿用内存种子设置 */
  }

  try {
    const res = await fetch('/api/store')
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown[]>
      // 节点测试对话记录与历史：与书库无关，始终从后端回载
      useAppStore.setState({
        testHistory: (data.testHistory ?? data.imageGallery ?? []) as TestHistoryItem[],
        chatSessions: (data.chatSessions ?? []) as ChatSession[],
      })
      if (Array.isArray(data.books) && data.books.length > 0) {
        useAppStore.setState({
          books: data.books as Book[],
          chapters: (data.chapters ?? []) as Chapter[],
          cards: (data.cards ?? []) as EntityCard[],
          outline: (data.outline ?? []) as OutlineNode[],
          scenes: (data.scenes ?? []) as SimScene[],
          fragments: (data.fragments ?? []) as SimFragment[],
          stateEvents: (data.stateEvents ?? []) as StateEvent[],
          issues: (data.issues ?? []) as ConsistencyIssue[],
          architectures: (data.architectures ?? []) as NovelArchitecture[],
          mergeCandidates: (data.mergeCandidates ?? []) as MergeCandidate[],
        })
        // 旧 settings.json 没有该标记 → 趁这次有数据时补写，避免后续"删光"误触发回填
        if (!storeInitialized) {
          await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storeInitialized: true }),
          }).catch(() => {})
        }
      } else if (!storeInitialized) {
        // 仅「首次运行」播种：后端为空且从未初始化过 → 用种子并持久化 + 标记已初始化。
        // 业务种子 = 12 业务字段（seedBooks 等当前均为空数组），与原 businessPayload(seedState()) 等价。
        const seed = {
          books: seedBooks,
          chapters: seedChapters,
          cards: seedCards,
          outline: seedOutline,
          scenes: seedScenes,
          fragments: seedFragments,
          stateEvents: seedStateEvents,
          issues: seedIssues,
          architectures: seedArchitectures,
          mergeCandidates: seedMergeCandidates,
          testHistory: [],
          chatSessions: [],
        }
        useAppStore.setState(seed)
        await pushStore(seed)
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeInitialized: true }),
        }).catch(() => {})
      } else {
        // 已初始化但库为空（用户删光了书 / 切到空目录）→ 必须显式把内存清空，
        // 否则内存里仍是 seedState() 的两本种子书，后续任意 setState（如 currentBookId
        // 改动）触发 storeReady 订阅 → 把这两本假书 pushStore 回后端 → 重启后「自动冒出」。
        // ⚠️ 关键：清空前先临时关掉 storeReady，避免"内存清空"这一步本身触发订阅把空数组
        // POST 回后端、反向删除后端未来可能恢复的数据。清空后重新开启 storeReady。
        // （若刚入库的书因后端瞬时读空走到这里，pushStoreNow 已在入库时即时落库；此处清空
        // 只影响内存，不影响后端。）
        setStoreReady(false)
        useAppStore.setState({
          books: [],
          chapters: [],
          cards: [],
          outline: [],
          scenes: [],
          fragments: [],
          stateEvents: [],
          issues: [],
          architectures: [],
          mergeCandidates: [],
        })
        setStoreReady(true)
      }
    }
  } catch {
    /* 后端不可用：保留内存种子，仅本会话有效 */
  }

  setStoreReady(true)
}

/** 切换资产目录后重新载入该目录的业务数据。 */
export async function reloadStoreFromBackend(): Promise<void> {
  const res = await fetch('/api/store')
  if (!res.ok) return
  const data = (await res.json()) as Record<string, unknown[]>
  // 节点测试对话记录与历史：与书库无关，始终从后端回载
  useAppStore.setState({
    testHistory: (data.testHistory ?? data.imageGallery ?? []) as TestHistoryItem[],
    chatSessions: (data.chatSessions ?? []) as ChatSession[],
  })
  if (Array.isArray(data.books) && data.books.length > 0) {
    useAppStore.setState({
      books: data.books as Book[],
      chapters: (data.chapters ?? []) as Chapter[],
      cards: (data.cards ?? []) as EntityCard[],
      outline: (data.outline ?? []) as OutlineNode[],
      scenes: (data.scenes ?? []) as SimScene[],
      fragments: (data.fragments ?? []) as SimFragment[],
      stateEvents: (data.stateEvents ?? []) as StateEvent[],
      issues: (data.issues ?? []) as ConsistencyIssue[],
      architectures: (data.architectures ?? []) as NovelArchitecture[],
      mergeCandidates: (data.mergeCandidates ?? []) as MergeCandidate[],
    })
  } else {
    useAppStore.setState({
      books: [],
      chapters: [],
      cards: [],
      outline: [],
      scenes: [],
      fragments: [],
      stateEvents: [],
      issues: [],
      architectures: [],
      mergeCandidates: [],
    })
  }
}
