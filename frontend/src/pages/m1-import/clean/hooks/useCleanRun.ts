// 清理调度器 hook —— 从 Step3Clean.tsx 提取的运行控制逻辑。
// 封装：buildCleanNodes、startAi/pause/resume/stop、runBatchCleanTest、retryFailed 等。
// 与 UI 面板解耦：仅依赖 useAppStore 与传入的 chapterRange/cleanRun 状态。
import { useEffect, useRef, useState } from 'react'
import type { App } from 'antd'
import {
  startCleanQueue,
  getDefaultPrompt,
  type CleanNode,
  type CleanQueueHandle,
  type CleanQueueCallbacks,
  type CleanQueueDebugEvent,
} from '../../../../services/api'
import type { ImportChapter } from '../../../../services/types'
import { useAppStore, pushImportSessionNow, type CleanRunNodeSession, type CleanRunActiveTask } from '../../../../store/appStore'
import { resolveProviderNodes } from '../../../../utils/providerResolver'

/** 节点参与运行时状态（与原 Step3Clean 同） */
export interface NodeRuntime {
  nodeId: string
  participating: boolean
  concurrency: number
  batchChars: number
  intervalSec: number
}

export interface UseCleanRunParams {
  message: ReturnType<typeof App.useApp>['message']
  /** 范围内待处理章节（已按 start/end 切片，且只含 pending/needsReprocess/failed） */
  rangeTargets: ImportChapter[]
  /** 当前选中运行的参选节点运行时状态列表 */
  nodeRunStates: NodeRuntime[]
  /** 测试文本（用于批量测试） */
  testText: string
  /** 系统提示词（m1 默认） */
  m1SystemPrompt: string
  /** 自动重试开关 */
  autoRetry: boolean
  /** 通过 chapterId 查 title 的回调（用于 onError 提示） */
  getChapterTitle: (chapterId: string) => string
  /** 来自父级的 selectedTask / selectedNode 桥（受控/非受控模式） */
  selectedTask: string | null
  setSelectedTask: React.Dispatch<React.SetStateAction<string | null>>
  selectedNode: string | null
  setSelectedNode: React.Dispatch<React.SetStateAction<string | null>>
  /** 调试事件桥：startCleanQueue 的 onDebug 回调（写父级 debug 缓冲） */
  onDebug?: (evt: CleanQueueDebugEvent) => void
}

export interface UseCleanRunResult {
  // 调度器控制
  startAi: () => void
  pause: () => void
  resume: () => void
  stop: () => void
  retryFailed: () => void
  gotoReview: () => void
  runBatchCleanTest: () => Promise<void>
  batchTesting: boolean

  // 节点运行时热更新
  hotUpdateNodes: () => void
  toggleParticipating: (nodeId: string, on: boolean) => void
  applyBulkToAll: (params: { concurrency: number | null; batchChars: number | null; intervalSec: number | null }) => void

  // 内部工具（暴露给父级做 store patch）
  buildCleanNodes: () => CleanNode[]
  patchChapter: (chapterId: string, patch: Record<string, unknown>) => void
  patchRun: (patch: Partial<{ handle: unknown; running: boolean; paused: boolean; active: CleanRunActiveTask[]; nodeSessions: CleanRunNodeSession[]; startedAt: number }>) => void
  clearRun: () => void

  // 内部 refs（供父级接入清理调度器）
  handleRef: React.MutableRefObject<CleanQueueHandle | null>
  chapterNodeRef: React.MutableRefObject<Map<string, string>>
}

export function useCleanRun(params: UseCleanRunParams): UseCleanRunResult {
  const {
    message,
    rangeTargets,
    nodeRunStates,
    testText,
    m1SystemPrompt,
    autoRetry,
    getChapterTitle,
    setSelectedTask,
    setSelectedNode,
    onDebug,
  } = params

  const errorCountRef = useRef(0)
  const handleRef = useRef<CleanQueueHandle | null>(null)
  const chapterNode = useRef<Map<string, string>>(new Map())
  const accMapRef = useRef<Map<string, string>>(new Map())
  const [batchTesting, setBatchTesting] = useState(false)

  // 挂载时从 store 恢复 handle（Step4 切回 Step3 时 cleanRun 已有值）
  useEffect(() => {
    const cr = useAppStore.getState().cleanRun
    if (cr?.handle && cr.running) {
      handleRef.current = cr.handle as CleanQueueHandle
    }
  }, [])

  // 运行中清理：cleanRun 中的 handle 变化时同步到 handleRef
  useEffect(() => {
    const cr = useAppStore.getState().cleanRun
    if (cr?.handle) {
      handleRef.current = cr.handle as CleanQueueHandle
    } else if (!cr) {
      handleRef.current = null
    }
  })

  const patchRun: UseCleanRunResult['patchRun'] = (patch) => {
    const cr = useAppStore.getState().cleanRun
    useAppStore.getState().setState({
      cleanRun: cr
        ? { ...cr, ...patch }
        : { handle: null, running: false, paused: false, active: [], nodeSessions: [], startedAt: 0, ...patch },
    })
  }

  const clearRun = () => {
    useAppStore.getState().setState({ cleanRun: null })
  }

  const patchChapter: UseCleanRunResult['patchChapter'] = (chapterId, patch) => {
    const cur = useAppStore.getState().importSession
    if (!cur) return
    useAppStore.getState().setState({
      importSession: {
        ...cur,
        chapters: cur.chapters.map((c) => (c.id === chapterId ? { ...c, ...patch } : c)),
      },
    })
  }

  const buildCleanNodes: UseCleanRunResult['buildCleanNodes'] = () => {
    const s = useAppStore.getState()
    const nowOverrides = s.cleanNodeOverrides
    const nowResolved = resolveProviderNodes({ providers: s.providers, providerNodes: s.providerNodes })
    return nowResolved
      .filter((p) => p.enabled && p.nodeType === 'text')
      .filter((p) => (nowOverrides[p.id] ?? {}).participating !== false)
      .map((p) => {
        const o = nowOverrides[p.id] ?? {}
        const displayName = `${p.providerName} · ${p.model}`
        return {
          id: p.id,
          name: displayName,
          baseURL: p.baseURL,
          apiKey: p.apiKey?.trim() || undefined,
          model: p.model,
          maxConcurrency: o.concurrency ?? p.maxConcurrency,
          batchChars: o.batchChars ?? p.batchChars,
          intervalSec: o.intervalSec ?? p.intervalSec,
        }
      })
      .filter((n) => n.baseURL.trim() && n.model.trim())
  }

  const trackAssign = (chapterId: string, nodeName: string, nodeId?: string, workerId?: string, batchSeq?: number) => {
    if (!nodeId || !workerId || batchSeq == null) return
    const sessionKey = `${workerId}:${batchSeq}`
    chapterNode.current.set(chapterId, sessionKey)
    const cr = useAppStore.getState().cleanRun
    const prev = cr?.nodeSessions ?? []
    const idx = prev.findIndex((s) => s.sessionKey === sessionKey)
    if (idx >= 0) {
      const next = [...prev]
      next[idx] = { ...next[idx], assigned: [...next[idx].assigned, chapterId] }
      useAppStore.getState().setState({ cleanRun: { ...cr!, nodeSessions: next } })
      return
    }
    const slotNum = workerId.split('#')[1] || '?'
    const fresh: CleanRunNodeSession = {
      sessionKey,
      nodeId,
      name: `${nodeName} #${slotNum}`,
      assigned: [chapterId],
      done: [],
      idle: false,
    }
    const cleaned = prev.filter((s) => !s.sessionKey.startsWith(`${workerId}:`))
    useAppStore.getState().setState({ cleanRun: { ...cr!, nodeSessions: [...cleaned, fresh] } })
  }

  const trackComplete = (chapterId: string) => {
    const sessionKey = chapterNode.current.get(chapterId)
    if (!sessionKey) return
    const cr = useAppStore.getState().cleanRun
    const prev = cr?.nodeSessions ?? []
    const idx = prev.findIndex((s) => s.sessionKey === sessionKey)
    if (idx < 0) return
    const s = prev[idx]
    const done = [...s.done, chapterId]
    const allDone = s.assigned.every((cid) => done.includes(cid))
    const next = [...prev]
    next[idx] = { ...s, done, idle: allDone }
    useAppStore.getState().setState({ cleanRun: { ...cr!, nodeSessions: next } })
  }

  const startAi = () => {
    const cleanNodes = buildCleanNodes()
    if (!cleanNodes.length) {
      message.warning('请至少选择一个有效的节点（需配置 Base URL 与模型）')
      return
    }
    const targets = rangeTargets
    if (!targets.length) {
      message.info('范围内没有待清理章节（已清理章节如需重做请先在审核步标记重新处理）')
      return
    }
    patchRun({ running: true, paused: false, active: [], nodeSessions: [], startedAt: Date.now() })
    errorCountRef.current = 0
    chapterNode.current = new Map()
    targets.forEach((c) => patchChapter(c.id, { cleanStatus: 'pending' }))
    const cb: CleanQueueCallbacks = {
      onStart: (chapterId, nodeName, batchId, nodeId, workerId, batchSeq) => {
        patchChapter(chapterId, {
          cleanStatus: 'processing',
          ...(nodeId ? { processedByNode: { nodeId, nodeName } } : {}),
        })
        trackAssign(chapterId, nodeName, nodeId, workerId, batchSeq)
        const isAnchor = !!batchId
        const cr = useAppStore.getState().cleanRun
        const nextActive = [...(cr?.active ?? []), { chapterId, nodeName, nodeId, batchId, isBatchAnchor: isAnchor }]
        useAppStore.getState().setState({ cleanRun: { ...cr!, active: nextActive } })
        setSelectedTask((sel) => sel ?? chapterId)
      },
      onChunk: (chapterId, acc) => {
        accMapRef.current.set(chapterId, acc)
      },
      onDone: (chapterId, cleaned) => {
        patchChapter(chapterId, { cleanStatus: 'completed', cleanedContent: cleaned, lineDecisions: {} })
        trackComplete(chapterId)
        accMapRef.current.delete(chapterId)
        const cr = useAppStore.getState().cleanRun
        const nextActive = (cr?.active ?? []).filter((t) => t.chapterId !== chapterId)
        useAppStore.getState().setState({ cleanRun: { ...cr!, active: nextActive } })
        setSelectedTask((sel) => (sel === chapterId ? null : sel))
      },
      onError: (chapterId, msg) => {
        patchChapter(chapterId, { cleanStatus: 'failed' })
        trackComplete(chapterId)
        accMapRef.current.delete(chapterId)
        const cr = useAppStore.getState().cleanRun
        const nextActive = (cr?.active ?? []).filter((t) => t.chapterId !== chapterId)
        useAppStore.getState().setState({ cleanRun: { ...cr!, active: nextActive } })
        setSelectedTask((sel) => (sel === chapterId ? null : sel))
        const title = getChapterTitle(chapterId)
        message.error({ key: 'm1-clean-error', content: `清理失败（累计 ${++errorCountRef.current} 章）·最近「${title}」：${msg}` })
      },
      onFinish: () => {
        pushImportSessionNow()
        accMapRef.current = new Map()
        clearRun()
        chapterNode.current = new Map()
        setSelectedNode(null)
        setSelectedTask(null)
        message.success('清理完成，请进入审核步骤')
      },
      onNodeDisabled: (nodeId, nodeName, reason) => {
        useAppStore.getState().setState({
          cleanNodeOverrides: {
            ...useAppStore.getState().cleanNodeOverrides,
            [nodeId]: {
              ...(useAppStore.getState().cleanNodeOverrides[nodeId] ?? {}),
              participating: false,
            },
          },
        })
        const cr = useAppStore.getState().cleanRun
        if (cr) {
          useAppStore.getState().setState({
            cleanRun: { ...cr, nodeSessions: cr.nodeSessions.filter((s) => s.nodeId !== nodeId) },
          })
        }
        message.error({ key: 'm1-node-disabled', content: `节点「${nodeName}」已自动关闭：${reason}` })
      },
      onDebug: onDebug,
    }
    const handle = startCleanQueue(
      targets.map((c) => ({ id: c.id, content: c.content })),
      cleanNodes,
      cb,
      {
        systemPrompt: useAppStore.getState().promptOverrides['m1-clean'] || m1SystemPrompt || undefined,
        isNodeAvailable: (id) => useAppStore.getState().consumeProviderUsage(id),
        autoRetry,
      },
    )
    handleRef.current = handle
    const cr = useAppStore.getState().cleanRun
    if (cr) useAppStore.getState().setState({ cleanRun: { ...cr, handle: handle as unknown } })
  }

  const pause = () => {
    handleRef.current?.pause()
    patchRun({ paused: true })
    pushImportSessionNow()
  }

  const resume = () => {
    handleRef.current?.resume()
    patchRun({ paused: false })
  }

  const stop = () => {
    handleRef.current?.stop()
    pushImportSessionNow()
    accMapRef.current = new Map()
    clearRun()
    chapterNode.current = new Map()
    const cur = useAppStore.getState().importSession
    if (cur)
      useAppStore.getState().setState({
        importSession: {
          ...cur,
          chapters: cur.chapters.map((c) =>
            c.cleanStatus === 'processing' ? { ...c, cleanStatus: 'pending' } : c,
          ),
        },
      })
  }

  const hotUpdateNodes = () => {
    if (!useAppStore.getState().cleanRun?.running || !handleRef.current) return
    handleRef.current.updateNodes(buildCleanNodes())
  }

  const toggleParticipating: UseCleanRunResult['toggleParticipating'] = (nodeId, on) => {
    useAppStore.getState().setState({
      cleanNodeOverrides: {
        ...useAppStore.getState().cleanNodeOverrides,
        [nodeId]: { ...(useAppStore.getState().cleanNodeOverrides[nodeId] ?? {}), participating: on },
      },
    })
    setTimeout(hotUpdateNodes, 0)
  }

  const applyBulkToAll: UseCleanRunResult['applyBulkToAll'] = ({ concurrency, batchChars, intervalSec }) => {
    if (concurrency == null && batchChars == null && intervalSec == null) {
      message.warning('请至少填写一个参数')
      return
    }
    const current = useAppStore.getState().cleanNodeOverrides
    const next = { ...current }
    for (const rs of nodeRunStates) {
      next[rs.nodeId] = {
        ...(next[rs.nodeId] ?? {}),
        ...(concurrency != null ? { concurrency } : {}),
        ...(batchChars != null ? { batchSize: batchChars } : {}),
        ...(intervalSec != null ? { intervalSec } : {}),
      }
    }
    useAppStore.getState().setState({ cleanNodeOverrides: next })
    if (useAppStore.getState().cleanRun?.running) setTimeout(hotUpdateNodes, 0)
    const parts: string[] = []
    if (concurrency != null) parts.push(`${concurrency} 进程`)
    if (batchChars != null) parts.push(`${batchChars} 章节`)
    if (intervalSec != null) parts.push(`${intervalSec}s`)
    message.success(`已统一设置 ${nodeRunStates.length} 个节点：${parts.join(' · ')}`)
  }

  const retryFailed = () => {
    const cur = useAppStore.getState().importSession
    if (!cur) return
    const failed = cur.chapters.filter((c) => c.cleanStatus === 'failed')
    if (!failed.length) {
      message.info('范围内没有失败章节')
      return
    }
    useAppStore.getState().setState({
      importSession: {
        ...cur,
        chapters: cur.chapters.map((c) => (c.cleanStatus === 'failed' ? { ...c, cleanStatus: 'pending' } : c)),
      },
    })
    message.success(`已将 ${failed.length} 个失败章节放回待处理，点击「开始清理」重跑`)
  }

  const gotoReview = () => {
    const cur = useAppStore.getState().importSession
    if (!cur) return
    useAppStore.getState().setState({ importSession: { ...cur, step: 3 } })
  }

  const runBatchCleanTest = async () => {
    const s = useAppStore.getState()
    const nowResolved = resolveProviderNodes({ providers: s.providers, providerNodes: s.providerNodes })
    const targets = nowResolved
      .filter((p) => p.enabled && p.nodeType === 'text')
      .filter((p) => (s.cleanNodeOverrides[p.id] ?? {}).participating !== false)
      .filter((p) => p.baseURL.trim() && p.model.trim())
    if (!targets.length) {
      message.warning('没有参选的文本节点')
      return
    }
    const testContent = testText
    if (!testContent.trim()) {
      message.warning('测试文本为空，请先在「测试文本」中设置')
      return
    }
    const systemPrompt = s.promptOverrides['m1-clean'] || s.m1SystemPrompt || undefined
    setBatchTesting(true)
    let done = 0
    let okCount = 0
    const CONCURRENCY = 4
    const idx = { i: 0 }
    const runOne = async (node: (typeof nowResolved)[number]) => {
      try {
        const res = await fetch('/api/llm/clean', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseURL: node.baseURL,
            apiKey: node.apiKey,
            model: node.model,
            content: testContent,
            systemPrompt,
          }),
        })
        const ok = res.ok
        const raw = useAppStore.getState().providerNodes.find((n) => n.id === node.id)
        if (raw) useAppStore.getState().updateProviderNode({ ...raw, lastTestResult: ok ? 'ok' : 'fail' })
        if (ok) okCount += 1
      } catch {
        const raw = useAppStore.getState().providerNodes.find((n) => n.id === node.id)
        if (raw) useAppStore.getState().updateProviderNode({ ...raw, lastTestResult: 'fail' })
      }
      done += 1
      message.info({ content: `批量测试进度：${done}/${targets.length}`, key: 'batch-clean-test-progress' })
    }
    const workers: Promise<void>[] = []
    for (let w = 0; w < CONCURRENCY; w++) {
      workers.push(
        (async () => {
          while (idx.i < targets.length) {
            const node = targets[idx.i++]
            await runOne(node)
          }
        })(),
      )
    }
    await Promise.all(workers)
    setBatchTesting(false)
    message.success(`批量测试完成：${okCount}/${targets.length} 正常`)
  }

  return {
    startAi,
    pause,
    resume,
    stop,
    retryFailed,
    gotoReview,
    runBatchCleanTest,
    batchTesting,
    hotUpdateNodes,
    toggleParticipating,
    applyBulkToAll,
    buildCleanNodes,
    patchChapter,
    patchRun,
    clearRun,
    handleRef,
    chapterNodeRef: chapterNode,
  }
}

/** 加载内置默认 prompt 一次（与原 Step3Clean 行为一致） */
export function useDefaultPromptLoader(): boolean {
  const [promptLoaded, setPromptLoaded] = useState(false)
  useEffect(() => {
    if (promptLoaded) return
    getDefaultPrompt().then((p) => {
      if (p) setPromptLoaded(true)
    })
  }, [promptLoaded])
  return promptLoaded
}
