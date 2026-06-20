import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Input,
  InputNumber,
  List,
  Progress,
  Radio,
  Row,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import {
  CaretRightOutlined,
  PauseOutlined,
  StopOutlined,
  ThunderboltOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'
import { startCleanQueue, getDefaultPrompt, type CleanNode, type CleanQueueHandle, type CleanQueueDebugEvent } from '../../services/api'

interface ActiveTask {
  chapterId: string
  nodeName: string
  nodeId?: string
  acc: string
  batchId?: string
  isBatchAnchor?: boolean
}

interface DebugEntry {
  chapterId: string
  id: number
  title: string
  type: 'request' | 'response' | 'error'
  timestamp: number
  nodeName?: string
  nodeId?: string
  model?: string
  batchSize?: number
  contentLength?: number
  requestBody?: Record<string, unknown>
  statusCode?: number
  responseBody?: string
  chunksCount?: number
  error?: string
  outputLength?: number
  firstBytesAt?: number
}

/** 节点参与运行时状态 */
interface NodeRuntime {
  nodeId: string
  participating: boolean
  concurrency: number
  batchSize: number
  intervalSec: number
}

/** 工作节点的一次会话（按批次生命周期）：节点被分配任务时创建，本批全部完成后置 idle。
 *  下次再被分配→新建会话替换（重置计数、置底部）；运行结束/被关闭→硬删除。 */
interface NodeSession {
  nodeId: string
  name: string
  /** 本会话接手的章节 id（含已完成，按接手顺序） */
  assigned: string[]
  /** 本会话已完成的章节 id */
  done: Set<string>
  /** 本会话所有接手章均已完成（变灰，等待被替换/移除） */
  idle: boolean
}

export default function Step3Clean() {
  const { message } = App.useApp()
  const session = useAppStore((s) => s.importSession)
  const providers = useAppStore((s) => s.providers)
  const m1SystemPrompt = useAppStore((s) => s.m1SystemPrompt)
  const setState = useAppStore((s) => s.setState)
  /** 节点运行时覆盖——持久化到 store（settings.json），避免 Step3 重挂载/步骤切换丢失 */
  const overrides = useAppStore((s) => s.cleanNodeOverrides)
  const setOverrides = (
    next: Record<string, Partial<NodeRuntime>> | ((prev: Record<string, Partial<NodeRuntime>>) => Record<string, Partial<NodeRuntime>>),
  ) =>
    setState({
      cleanNodeOverrides:
        typeof next === 'function' ? next(useAppStore.getState().cleanNodeOverrides) : next,
    })

  const enabledNodes = useMemo(() => providers.filter((p) => p.enabled), [providers])

  /** 统一设置所有节点三参数（应用后仍可逐节点单独覆盖） */
  const [bulkConcurrency, setBulkConcurrency] = useState<number | null>(null)
  const [bulkBatchSize, setBulkBatchSize] = useState<number | null>(null)
  const [bulkIntervalSec, setBulkIntervalSec] = useState<number | null>(null)

  /** 有效节点运行时状态 = ProviderNode 默认值 + 用户覆盖 */
  const nodeRunStates: NodeRuntime[] = useMemo(
    () =>
      enabledNodes.map((p) => {
        const o = overrides[p.id] ?? {}
        return {
          nodeId: p.id,
          participating: o.participating ?? true,
          concurrency: o.concurrency ?? p.maxConcurrency,
          batchSize: o.batchSize ?? p.batchSize,
          intervalSec: o.intervalSec ?? p.intervalSec,
        }
      }),
    [enabledNodes, overrides],
  )

  const [rangeStart, setRangeStart] = useState<number | null>(1)
  const [rangeEnd, setRangeEnd] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [active, setActive] = useState<ActiveTask[]>([])
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([])
  const [logFilter, setLogFilter] = useState<'all' | 'request' | 'response' | 'error'>('all')
  const [overridePrompt, setOverridePrompt] = useState('')
  const [promptLoaded, setPromptLoaded] = useState(false)
  const debugIdRef = useRef(0)
  const handleRef = useRef<CleanQueueHandle | null>(null)

  /** 列表视图切换：待处理 / 完成 / 工作节点 / 节点任务 */
  const [listTab, setListTab] = useState<'pending' | 'done' | 'nodes' | 'nodeTasks'>('pending')
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  /** 工作节点会话（有序数组，底部=最新） */
  const [nodeSessions, setNodeSessions] = useState<NodeSession[]>([])
  /** chapterId → 当前所属会话的 nodeId（onStart 写入，onDone/onError 读） */
  const chapterNode = useRef<Map<string, string>>(new Map())

  // 挂载时加载内置默认 prompt
  useEffect(() => {
    if (promptLoaded) return
    getDefaultPrompt().then((p) => {
      if (p) {
        setOverridePrompt(p)
        setPromptLoaded(true)
      }
    })
  }, [promptLoaded])

  // 卷标记章（skipClean）跳过 LLM 清理：直接置 completed 且原样保留正文。
  // 在进入 Step3 / 章节列表变化时补刷一次，确保进度条与队列都把它们视为已完成。
  useEffect(() => {
    const cur = useAppStore.getState().importSession
    if (!cur) return
    const dirty = cur.chapters.filter((c) => c.skipClean && c.cleanStatus !== 'completed')
    if (dirty.length === 0) return
    setState({
      importSession: {
        ...cur,
        chapters: cur.chapters.map((c) =>
          c.skipClean && c.cleanStatus !== 'completed'
            ? { ...c, cleanStatus: 'completed', cleanedContent: c.content, lineDecisions: {} }
            : c,
        ),
      },
    })
  }, [session?.chapters, setState])

  if (!session) return null
  const chapters = session.chapters
  const total = chapters.length
  const pendingNotProcessing = chapters.filter(
    (c) => c.cleanStatus === 'pending' || c.cleanStatus === 'needsReprocess' || c.cleanStatus === 'failed',
  )
  const pendingCount = pendingNotProcessing.length
  const start = Math.max(1, Math.min(rangeStart ?? 1, pendingCount))
  const end = Math.min(rangeEnd ?? pendingCount, pendingCount)
  const doneCount = chapters.filter((c) => c.cleanStatus === 'completed' || c.cleanStatus === 'accepted').length

  /** 参选节点（participating 为 true） */
  const participatingNodes = nodeRunStates.filter((s) => s.participating)

  const patchChapter = (chapterId: string, patch: Record<string, unknown>) => {
    const cur = useAppStore.getState().importSession
    if (!cur) return
    setState({
      importSession: {
        ...cur,
        chapters: cur.chapters.map((c) => (c.id === chapterId ? { ...c, ...patch } : c)),
      },
    })
  }

  const rangeTargets = () => {
    const slice = pendingNotProcessing.slice(start - 1, end)
    return [
      ...slice.filter((c) => c.cleanStatus === 'needsReprocess'),
      ...slice.filter((c) => c.cleanStatus === 'failed'),
      ...slice.filter((c) => c.cleanStatus === 'pending'),
    ]
  }

  /** 构建 CleanNode 列表（带热更新后的参数） */
  const buildCleanNodes = (): CleanNode[] => {
    return participatingNodes.map((rs) => {
      const p = providers.find((x) => x.id === rs.nodeId)
      return {
        id: rs.nodeId,
        name: p?.name ?? rs.nodeId,
        baseURL: p?.baseURL ?? '',
        apiKey: p?.apiKey?.trim() || undefined,
        model: p?.model ?? '',
        maxConcurrency: rs.concurrency,
        batchSize: rs.batchSize,
        intervalSec: rs.intervalSec,
      }
    }).filter((n) => n.baseURL.trim() && n.model.trim())
  }

  /** onStart：记录 chapterId → nodeId，并维护节点会话（按批次生命周期） */
  const trackAssign = (chapterId: string, nodeName: string, nodeId?: string) => {
    if (!nodeId) return
    chapterNode.current.set(chapterId, nodeId)
    setNodeSessions((prev) => {
      const idx = prev.findIndex((s) => s.nodeId === nodeId)
      // 已有会话且未 idle → 直接追加；已 idle → 视为新一批，替换（重置计数、置底部）
      if (idx >= 0 && !prev[idx].idle) {
        const next = [...prev]
        const s = { ...next[idx], assigned: [...next[idx].assigned, chapterId] }
        next[idx] = s
        return next
      }
      const fresh: NodeSession = { nodeId, name: nodeName, assigned: [chapterId], done: new Set(), idle: false }
      if (idx >= 0) {
        // idle 会话被替换
        const next = prev.filter((s) => s.nodeId !== nodeId)
        return [...next, fresh]
      }
      return [...prev, fresh]
    })
  }

  /** onDone/onError：标记会话内该章完成；本会话全部完成则置 idle */
  const trackComplete = (chapterId: string) => {
    const nodeId = chapterNode.current.get(chapterId)
    if (!nodeId) return
    setNodeSessions((prev) => {
      const idx = prev.findIndex((s) => s.nodeId === nodeId)
      if (idx < 0) return prev
      const s = prev[idx]
      const done = new Set(s.done).add(chapterId)
      const allDone = s.assigned.every((cid) => done.has(cid))
      const next = [...prev]
      next[idx] = { ...s, done, idle: allDone }
      return next
    })
  }

  const startAi = () => {
    const cleanNodes = buildCleanNodes()
    if (!cleanNodes.length) {
      message.warning('请至少选择一个有效的节点（需配置 Base URL 与模型）')
      return
    }
    const targets = rangeTargets()
    if (!targets.length) {
      message.info('范围内没有待清理章节（已清理章节如需重做请先在审核步标记重新处理）')
      return
    }
    setRunning(true)
    setPaused(false)
    // 重置节点会话视图（每次启动清空旧会话）
    setNodeSessions([])
    chapterNode.current = new Map()
    targets.forEach((c) => patchChapter(c.id, { cleanStatus: 'pending' }))
    handleRef.current = startCleanQueue(
      targets.map((c) => ({ id: c.id, content: c.content })),
      cleanNodes,
      {
        onStart: (chapterId, nodeName, batchId, nodeId) => {
          patchChapter(chapterId, {
            cleanStatus: 'processing',
            ...(nodeId ? { processedByNode: { nodeId, nodeName } } : {}),
          })
          trackAssign(chapterId, nodeName, nodeId)
          const isAnchor = !!batchId
          setActive((prev) => [...prev, { chapterId, nodeName, nodeId, acc: '', batchId, isBatchAnchor: isAnchor }])
          setSelectedTask((sel) => sel ?? chapterId)
        },
        onChunk: (chapterId, acc) => {
          setActive((prev) => prev.map((t) => (t.chapterId === chapterId ? { ...t, acc } : t)))
        },
        onDone: (chapterId, cleaned) => {
          patchChapter(chapterId, { cleanStatus: 'completed', cleanedContent: cleaned, lineDecisions: {} })
          trackComplete(chapterId)
          setActive((prev) => prev.filter((t) => t.chapterId !== chapterId))
          setSelectedTask((sel) => (sel === chapterId ? null : sel))
        },
        onError: (chapterId, msg) => {
          patchChapter(chapterId, { cleanStatus: 'failed' })
          trackComplete(chapterId)
          setActive((prev) => prev.filter((t) => t.chapterId !== chapterId))
          setSelectedTask((sel) => (sel === chapterId ? null : sel))
          message.error(`「${chapters.find((c) => c.id === chapterId)?.title ?? chapterId}」清理失败：${msg}`)
        },
        onFinish: () => {
          setRunning(false)
          setActive([])
          // 运行结束：清空所有节点会话视图（节点任务列表随之清空）
          setNodeSessions([])
          chapterNode.current = new Map()
          setSelectedNode(null)
          message.success('清理完成，请进入审核步骤')
        },
        onNodeDisabled: (nodeId, nodeName, reason) => {
          // 调度器熔断该节点 → 同步把参与开关切到关闭（写入 store 覆盖），并提示
          setOverrides((prev) => ({
            ...prev,
            [nodeId]: { ...(prev[nodeId] ?? {}), participating: false },
          }))
          message.error(`节点「${nodeName}」已自动关闭：${reason}`)
        },
        onDebug: (evt: CleanQueueDebugEvent) => {
          debugIdRef.current += 1
          setDebugEntries((prev) => {
            const next = [
              ...prev,
              {
                chapterId: evt.chapterId,
                id: debugIdRef.current,
                title: evt.chapterTitle ?? chapters.find((c) => c.id === evt.chapterId)?.title ?? evt.chapterId,
                type: evt.type,
                timestamp: evt.timestamp,
                nodeName: evt.nodeName,
                nodeId: evt.nodeId,
                model: evt.model,
                batchSize: evt.batchSize,
                contentLength: evt.contentLength,
                requestBody: evt.requestBody,
                statusCode: evt.statusCode,
                responseBody: evt.responseBody,
                chunksCount: evt.chunksCount,
                error: evt.error,
                outputLength: evt.outputLength,
                firstBytesAt: evt.firstBytesAt,
              },
            ]
            return next.slice(-200)
          })
        },
      },
      { systemPrompt: overridePrompt.trim() || m1SystemPrompt || undefined, isNodeAvailable: (id) => useAppStore.getState().consumeProviderUsage(id) },
    )
  }

  const pause = () => {
    handleRef.current?.pause()
    setPaused(true)
  }
  const resume = () => {
    handleRef.current?.resume()
    setPaused(false)
  }
  const stop = () => {
    handleRef.current?.stop()
    setRunning(false)
    setActive([])
    setNodeSessions([])
    chapterNode.current = new Map()
    const cur = useAppStore.getState().importSession
    if (cur)
      setState({
        importSession: {
          ...cur,
          chapters: cur.chapters.map((c) =>
            c.cleanStatus === 'processing' ? { ...c, cleanStatus: 'pending' } : c,
          ),
        },
      })
  }

  const updateNodeSetting = (nodeId: string, patch: Partial<NodeRuntime>) => {
    setOverrides((prev) => ({ ...prev, [nodeId]: { ...(prev[nodeId] ?? {}), ...patch } }))
  }

  /** 运行中热更新——即时推送给调度器 */
  const hotUpdateNodes = () => {
    if (!running || !handleRef.current) return
    handleRef.current.updateNodes(buildCleanNodes())
  }

  /** 运行中被关闭的节点：本会话视图保留至其进行中任务完成（idle 后由下次分配替换或结束清理） */
  const toggleParticipating = (nodeId: string, on: boolean) => {
    updateNodeSetting(nodeId, { participating: on })
    // 下一拍推送：开启→重新参选拾取待处理；关闭→不再分配新任务（进行中的会自然完成）
    setTimeout(hotUpdateNodes, 0)
  }

  /** 将已填字段一次性写入所有已启用节点（未填的保留原值）——修复"必须三字段全填"导致静默不生效 */
  const applyBulkToAll = () => {
    if (bulkConcurrency == null && bulkBatchSize == null && bulkIntervalSec == null) {
      message.warning('请至少填写一个参数')
      return
    }
    setOverrides((prev) => {
      const next = { ...prev }
      for (const rs of nodeRunStates) {
        next[rs.nodeId] = {
          ...(prev[rs.nodeId] ?? {}),
          ...(bulkConcurrency != null ? { concurrency: bulkConcurrency } : {}),
          ...(bulkBatchSize != null ? { batchSize: bulkBatchSize } : {}),
          ...(bulkIntervalSec != null ? { intervalSec: bulkIntervalSec } : {}),
        }
      }
      return next
    })
    if (running) setTimeout(hotUpdateNodes, 0)
    const parts: string[] = []
    if (bulkConcurrency != null) parts.push(`${bulkConcurrency} 进程`)
    if (bulkBatchSize != null) parts.push(`${bulkBatchSize} 章节`)
    if (bulkIntervalSec != null) parts.push(`${bulkIntervalSec}s`)
    message.success(`已统一设置 ${nodeRunStates.length} 个节点：${parts.join(' · ')}`)
  }

  /** 把范围内失败章节重新标记为可处理 */
  const retryFailed = () => {
    const cur = useAppStore.getState().importSession
    if (!cur) return
    const curPending = cur.chapters.filter(
      (c) => c.cleanStatus === 'pending' || c.cleanStatus === 'needsReprocess' || c.cleanStatus === 'failed',
    )
    const failed = curPending.slice(start - 1, end).filter((c) => c.cleanStatus === 'failed')
    if (!failed.length) {
      message.info('范围内没有失败章节')
      return
    }
    setState({
      importSession: {
        ...cur,
        chapters: cur.chapters.map((c) =>
          c.cleanStatus === 'failed' ? { ...c, cleanStatus: 'pending' } : c,
        ),
      },
    })
    message.success(`已将 ${failed.length} 个失败章节放回待处理，点击「开始清理」重跑`)
  }

  const gotoReview = () =>
    setState({ importSession: { ...useAppStore.getState().importSession!, step: 3 } })

  const viewing = active.find((t) => t.chapterId === selectedTask) ?? active[0]
  const viewingChapter = viewing ? chapters.find((c) => c.id === viewing.chapterId) : (selectedTask ? chapters.find((c) => c.id === selectedTask) : null)

  // ── 列表数据 ──
  const pendingChapters = chapters.filter((c) =>
    c.cleanStatus === 'pending' || c.cleanStatus === 'processing' || c.cleanStatus === 'needsReprocess' || c.cleanStatus === 'failed',
  )
  const doneChapters = chapters.filter((c) => c.cleanStatus === 'completed' || c.cleanStatus === 'accepted')
  const selectedSession = nodeSessions.find((s) => s.nodeId === selectedNode) ?? null

  /** 选中节点任务列表里的章节（完成的不移除，直到该会话结束） */
  const nodeTaskChapters = selectedSession
    ? selectedSession.assigned.map((cid) => chapters.find((c) => c.id === cid)).filter(Boolean)
    : []

  /** 状态标签颜色 */
  const statusColor = (st: string) =>
    st === 'completed' || st === 'accepted' ? 'green'
      : st === 'processing' ? 'processing'
      : st === 'failed' ? 'red'
      : st === 'needsReprocess' ? 'orange'
      : 'default'

  const previewChapter = (chapterId: string) => setSelectedTask(chapterId)

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* 节点池（可折叠） */}
      <Collapse
        defaultActiveKey={['nodes']}
        items={[
          {
            key: 'nodes',
            label: (
              <Space>
                <Typography.Text strong>清理节点池</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  （{nodeRunStates.length} 个节点，参选 {participatingNodes.length}）
                </Typography.Text>
              </Space>
            ),
            children:
              nodeRunStates.length === 0 ? (
                <Alert type="warning" showIcon message="无已启用节点，请先到设置页新增并配置节点" />
              ) : (
                <>
                  {/* 统一设置所有可用节点的参数（仅已填字段生效，应用后仍可逐节点单独覆盖） */}
                  <Space size={8} align="center" wrap style={{ marginBottom: 12 }}>
                    <Typography.Text type="secondary">统一设置所有节点（仅填的生效）：</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>进程</Typography.Text>
                    <InputNumber
                      size="small"
                      min={1}
                      max={32}
                      value={bulkConcurrency}
                      placeholder="如 2"
                      style={{ width: 64 }}
                      onChange={(v) => setBulkConcurrency(v)}
                    />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>章节</Typography.Text>
                    <InputNumber
                      size="small"
                      min={1}
                      max={20}
                      value={bulkBatchSize}
                      placeholder="如 1"
                      style={{ width: 60 }}
                      onChange={(v) => setBulkBatchSize(v)}
                    />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>间隔</Typography.Text>
                    <InputNumber
                      size="small"
                      min={0}
                      max={60}
                      value={bulkIntervalSec}
                      placeholder="如 0"
                      style={{ width: 60 }}
                      onChange={(v) => setBulkIntervalSec(v)}
                    />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>s</Typography.Text>
                    <Button
                      size="small"
                      type="primary"
                      disabled={bulkConcurrency == null && bulkBatchSize == null && bulkIntervalSec == null}
                      onClick={applyBulkToAll}
                    >
                      统一设置
                    </Button>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      应用到全部 {nodeRunStates.length} 个节点，之后仍可逐节点单独调整
                    </Typography.Text>
                  </Space>

                  <Row gutter={[12, 12]}>
                    {nodeRunStates.map((rs) => {
                      const p = providers.find((x) => x.id === rs.nodeId)
                      const label = p ? `${p.name} · ${p.model || '（未设模型）'}` : rs.nodeId
                      return (
                        <Col key={rs.nodeId} xs={24} sm={12} lg={8} xl={6}>
                          <Card
                            size="small"
                            title={
                              <Space size={4}>
                                <Switch
                                  size="small"
                                  checked={rs.participating}
                                  onChange={(v) => toggleParticipating(rs.nodeId, v)}
                                />
                                <Typography.Text ellipsis style={{ maxWidth: 160 }}>
                                  {label}
                                </Typography.Text>
                              </Space>
                            }
                            style={{ borderColor: rs.participating ? '#1677ff' : undefined }}
                          >
                            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                              <Space size={4}>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>进程</Typography.Text>
                                <InputNumber
                                  size="small"
                                  min={1}
                                  max={32}
                                  value={rs.concurrency}
                                  style={{ width: 56 }}
                                  onChange={(v) => {
                                    updateNodeSetting(rs.nodeId, { concurrency: v ?? 1 })
                                    if (running) setTimeout(hotUpdateNodes, 0)
                                  }}
                                />
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>章节</Typography.Text>
                                <InputNumber
                                  size="small"
                                  min={1}
                                  max={20}
                                  value={rs.batchSize}
                                  style={{ width: 52 }}
                                  onChange={(v) => {
                                    updateNodeSetting(rs.nodeId, { batchSize: v ?? 1 })
                                    if (running) setTimeout(hotUpdateNodes, 0)
                                  }}
                                />
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>间隔</Typography.Text>
                                <InputNumber
                                  size="small"
                                  min={0}
                                  max={60}
                                  value={rs.intervalSec}
                                  style={{ width: 52 }}
                                  onChange={(v) => {
                                    updateNodeSetting(rs.nodeId, { intervalSec: v ?? 0 })
                                    if (running) setTimeout(hotUpdateNodes, 0)
                                  }}
                                />
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>s</Typography.Text>
                              </Space>
                              {running && rs.participating && (
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                  活跃 {active.filter((t) => t.nodeName === (p?.name ?? '')).length} / {rs.concurrency}
                                </Typography.Text>
                              )}
                              {!rs.participating && (
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>已关闭（不接新任务）</Typography.Text>
                              )}
                            </Space>
                          </Card>
                        </Col>
                      )
                    })}
                  </Row>
                </>
              ),
          },
        ]}
      />

      {/* 处理范围：相对待处理列表 */}
      <Space wrap align="center">
        <Typography.Text>处理范围：第</Typography.Text>
        <InputNumber
          min={1}
          max={Math.max(1, rangeEnd ?? pendingCount)}
          value={rangeStart}
          onChange={(v) => {
            setRangeStart(v)
            if (v != null && rangeEnd != null && v > rangeEnd) setRangeEnd(null)
          }}
          style={{ width: 70 }}
          placeholder="1"
        />
        <Typography.Text>—</Typography.Text>
        <InputNumber
          min={rangeStart ?? 1}
          max={pendingCount}
          value={rangeEnd}
          onChange={(v) => setRangeEnd(v)}
          style={{ width: 70 }}
          placeholder={String(pendingCount)}
        />
        <Typography.Text>章（待处理 {pendingCount} · 已处理 {doneCount} · 共 {total}）</Typography.Text>
      </Space>

      {/* 摘要 */}
      <Tag icon={<ThunderboltOutlined />} color={participatingNodes.length ? 'blue' : 'red'}>
        {participatingNodes.length ? `${participatingNodes.length} 个节点 · ` : '无参选节点'}
        {participatingNodes.map((s) => {
          const p = providers.find((x) => x.id === s.nodeId)
          return `${p?.name ?? s.nodeId}(${s.concurrency}进程/${s.batchSize}章)`
        }).join(', ')}
      </Tag>

      {/* 操作按钮 */}
      <Space wrap>
        {!running && (
          <Button type="primary" icon={<CaretRightOutlined />} onClick={startAi}>
            开始清理
          </Button>
        )}
        {running && !paused && (
          <Button icon={<PauseOutlined />} onClick={pause}>
            暂停
          </Button>
        )}
        {running && paused && (
          <Button type="primary" icon={<CaretRightOutlined />} onClick={resume}>
            继续
          </Button>
        )}
        {running && (
          <Button danger icon={<StopOutlined />} onClick={stop}>
            停止
          </Button>
        )}
        <Button icon={<ReloadOutlined />} onClick={retryFailed}>重试失败章</Button>
        <Button disabled={doneCount === 0} onClick={gotoReview}>
          进入审核 →
        </Button>
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setState({ importSession: { ...useAppStore.getState().importSession!, step: 1, fileName: '' } })}
        >
          新增节点去设置页
        </Button>
      </Space>

      <Progress percent={total ? Math.round((doneCount / total) * 100) : 0} />
      <Typography.Text type="secondary">
        共 {total} 章 · 已处理 {doneCount} · 待处理 {pendingCount} · 活跃 {active.length}
      </Typography.Text>

      {running && paused && (
        <Alert type="warning" showIcon message="已暂停：当前流式任务完成后不再取新任务。" />
      )}

      {/* 活跃任务 + 实时窗口 */}
      <Row gutter={16} style={{ height: 460 }}>
        <Col span={8} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Tabs
            className="m1-tabs-panel"
            size="small"
            activeKey={listTab}
            onChange={(k) => setListTab(k as typeof listTab)}
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            items={[
              {
                key: 'pending',
                label: `待处理列表（${pendingChapters.length}）`,
                children: (
                  <ChapterListPane
                    chapters={pendingChapters}
                    emptyText="无待处理章节"
                    selectedTask={selectedTask}
                    activeIds={new Set(active.map((a) => a.chapterId))}
                    onPick={previewChapter}
                    statusColor={statusColor}
                  />
                ),
              },
              {
                key: 'done',
                label: `完成列表（${doneChapters.length}）`,
                children: (
                  <ChapterListPane
                    chapters={doneChapters}
                    emptyText="暂无完成章节"
                    selectedTask={selectedTask}
                    activeIds={new Set()}
                    onPick={previewChapter}
                    statusColor={statusColor}
                  />
                ),
              },
              {
                key: 'nodes',
                label: `工作节点（${nodeSessions.length}）`,
                children: (
                  <NodeListPane
                    sessions={nodeSessions}
                    providers={providers}
                    selectedNode={selectedNode}
                    onPick={(nid) => {
                      setSelectedNode(nid)
                      setListTab('nodeTasks')
                    }}
                  />
                ),
              },
              {
                key: 'nodeTasks',
                label: selectedSession ? `${selectedSession.name} 任务（${selectedSession.assigned.length}）` : '节点任务',
                children: (
                  <ChapterListPane
                    chapters={nodeTaskChapters as typeof pendingChapters}
                    emptyText={selectedSession ? '该节点暂无任务' : '请在「工作节点」选择一个节点'}
                    selectedTask={selectedTask}
                    activeIds={new Set(active.map((a) => a.chapterId))}
                    onPick={previewChapter}
                    statusColor={statusColor}
                    doneSet={selectedSession?.done}
                  />
                ),
              },
            ]}
          />
        </Col>
        <Col span={16} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Typography.Title level={5} style={{ marginBottom: 8 }}>
            实时窗口（左：发送原文 / 右：流式输出）
            {viewingChapter && (
              <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                {viewingChapter.title}
              </Typography.Text>
            )}
          </Typography.Title>
          {/* minHeight:0 让 flex 子项可收缩到内容以下，配合内部 height:100%+overflow:auto
              才能固定高度滚动，而不会被长文本撑高（flex 默认 min-height:auto 不缩）。 */}
          <Row gutter={8} style={{ flex: 1, minHeight: 0 }}>
            <Col span={12} style={{ height: '100%' }}>
              <div className="stream-pane" style={{ background: '#1f2428', color: '#c9d1d9', height: '100%', overflow: 'auto' }}>
                {viewingChapter ? (viewingChapter.cleanStatus === 'completed' || viewingChapter.cleanStatus === 'accepted'
                  ? (viewingChapter.cleanedContent ?? viewingChapter.content)
                  : viewingChapter.content) : '（点击左侧列表项查看）'}
              </div>
            </Col>
            <Col span={12} style={{ height: '100%' }}>
              <div className="stream-pane" style={{ height: '100%', overflow: 'auto' }}>
                {viewing ? viewing.acc || '等待响应…' : (viewingChapter?.cleanedContent ?? '等待响应…')}
              </div>
            </Col>
          </Row>
        </Col>
      </Row>

      {/* 清理提示词（本次） */}
      <Collapse
        items={[
          {
            key: 'prompt',
            label: `清理提示词（本次）${overridePrompt ? ` · ${overridePrompt.length} 字` : ''}`,
            children: (
              <>
                <Input.TextArea
                  value={overridePrompt}
                  onChange={(e) => setOverridePrompt(e.target.value)}
                  autoSize={{ minRows: 4, maxRows: 14 }}
                  disabled={running}
                  placeholder={
                    m1SystemPrompt
                      ? `留空则使用设置页默认提示词（${m1SystemPrompt.length} 字）`
                      : '留空则使用后端内置默认提示词；到设置页可查看/修改默认'
                  }
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
                <Space style={{ marginTop: 8 }}>
                  <Button size="small" disabled={running || !overridePrompt} onClick={() => setOverridePrompt('')}>
                    清空本次覆盖
                  </Button>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    生效优先级：本次覆盖 &gt; 设置页默认 &gt; 后端内置 · 首次自动填入内置默认
                  </Typography.Text>
                </Space>
              </>
            ),
          },
        ]}
        style={{ background: '#fafafa' }}
      />

      {/* 调试日志（成功响应不再含流式正文，仅记录诊断信息） */}
      <Collapse
        items={[
          {
            key: 'debug',
            label: `请求/响应日志 (${debugEntries.length})`,
            children: (
              <>
                <Space style={{ marginBottom: 8 }}>
                  <Radio.Group
                    size="small"
                    optionType="button"
                    buttonStyle="solid"
                    value={logFilter}
                    onChange={(e) => setLogFilter(e.target.value)}
                    options={[
                      { value: 'all', label: '全部' },
                      { value: 'request', label: '请求' },
                      { value: 'response', label: '响应' },
                      { value: 'error', label: '错误' },
                    ]}
                  />
                  <Button size="small" disabled={!debugEntries.length} onClick={() => setDebugEntries([])}>
                    清空日志
                  </Button>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    每条请求显示实际 batchSize（1=单章请求，&gt;1=批量请求）
                  </Typography.Text>
                </Space>
                {debugEntries.length === 0 ? (
                  <Typography.Text type="secondary">暂无记录</Typography.Text>
                ) : (
                  <List
                    size="small"
                    dataSource={[...debugEntries]
                      .reverse()
                      .filter((e) => logFilter === 'all' || e.type === logFilter)}
                    renderItem={(e) => {
                      const time = new Date(e.timestamp).toLocaleTimeString()
                      const color = e.type === 'request' ? 'blue' : e.type === 'error' ? 'red' : 'green'
                      const reqTs = debugEntries.find((x) => x.chapterId === e.chapterId && x.type === 'request')?.timestamp
                      const elapsed = reqTs ? e.timestamp - reqTs : undefined
                      return (
                        <List.Item style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0', display: 'block' }}>
                          <div style={{ marginBottom: 4 }}>
                            <Space size={4} wrap>
                              <Tag color={color} style={{ margin: 0 }}>
                                {e.type === 'request' ? 'REQ' : e.type === 'error' ? 'ERR' : 'RES'}
                              </Tag>
                              <Typography.Text style={{ fontSize: 12 }}>{time}</Typography.Text>
                              <Typography.Text strong style={{ fontSize: 12 }}>
                                {e.title}
                              </Typography.Text>
                              {e.type === 'request' && (
                                <>
                                  <Tag style={{ margin: 0 }}>{e.nodeName}</Tag>
                                  {e.batchSize != null && (
                                    <Tag color={e.batchSize > 1 ? 'geekblue' : 'default'} style={{ margin: 0 }}>
                                      {e.batchSize > 1 ? `批量 ${e.batchSize} 章` : '单章'}
                                    </Tag>
                                  )}
                                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                    原文 {e.contentLength} 字
                                  </Typography.Text>
                                </>
                              )}
                              {e.type === 'response' && e.contentLength != null && e.outputLength != null && (
                                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                  {e.contentLength} → {e.outputLength} 字
                                </Typography.Text>
                              )}
                              {(e.type === 'response' || e.type === 'error') && e.statusCode != null && (
                                <Tag color={e.statusCode < 400 ? 'green' : 'red'} style={{ margin: 0 }}>
                                  HTTP {e.statusCode}
                                </Tag>
                              )}
                              {e.type === 'response' && (
                                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                  {e.chunksCount} chunks
                                </Typography.Text>
                              )}
                              {e.firstBytesAt != null && reqTs != null && (
                                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                  首字节 {(e.firstBytesAt - reqTs) / 1000}s
                                </Typography.Text>
                              )}
                              {elapsed != null && (
                                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                  耗时 {(elapsed / 1000).toFixed(1)}s
                                </Typography.Text>
                              )}
                              {e.type === 'error' && e.error && (
                                <Typography.Text type="danger" style={{ fontSize: 11 }}>
                                  {e.chunksCount != null ? `${e.chunksCount} chunks · ` : ''}
                                  {e.error}
                                </Typography.Text>
                              )}
                            </Space>
                          </div>
                          {e.requestBody && (
                            <div
                              style={{
                                background: '#1f2428',
                                color: '#c9d1d9',
                                padding: '6px 10px',
                                borderRadius: 4,
                                fontFamily: 'monospace',
                                fontSize: 11,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                                marginTop: 2,
                              }}
                            >
                              {JSON.stringify(e.requestBody, null, 2)}
                            </div>
                          )}
                          {e.responseBody && (
                            <div
                              style={{
                                background: e.type === 'error' ? '#fff1f0' : '#fffbe6',
                                padding: '6px 10px',
                                borderRadius: 4,
                                fontFamily: 'monospace',
                                fontSize: 11,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                                maxHeight: 200,
                                overflow: 'auto',
                                marginTop: 2,
                              }}
                            >
                              {e.responseBody}
                            </div>
                          )}
                        </List.Item>
                      )
                    }}
                  />
                )}
              </>
            ),
          },
        ]}
        style={{ background: '#fafafa' }}
      />
    </Space>
  )
}

// ── 子组件：章节列表格 ──

interface ChapterListPaneProps {
  chapters: Array<{ id: string; title: string; cleanStatus: string; cleanedContent?: string; content: string; processedByNode?: { nodeId: string; nodeName: string } }>
  emptyText: string
  selectedTask: string | null
  activeIds: Set<string>
  onPick: (chapterId: string) => void
  statusColor: (st: string) => string
  doneSet?: Set<string>
}

function ChapterListPane({ chapters, emptyText, selectedTask, activeIds, onPick, statusColor, doneSet }: ChapterListPaneProps) {
  return (
    <div style={{ height: '100%', overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
      {chapters.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} style={{ marginTop: 40 }} />
      ) : (
        chapters.map((c) => {
          const isActive = activeIds.has(c.id)
          const isDone = doneSet?.has(c.id)
          const outLen = c.cleanedContent?.length
          return (
            <div
              key={c.id}
              onClick={() => onPick(c.id)}
              style={{
                cursor: 'pointer',
                padding: '6px 10px',
                borderBottom: '1px solid #f0f0f0',
                background: selectedTask === c.id ? '#e6f4ff' : undefined,
                opacity: isDone ? 0.7 : 1,
              }}
            >
              <Typography.Text ellipsis style={{ maxWidth: 180, display: 'block', fontSize: 13 }}>
                {c.title}
              </Typography.Text>
              <Space size={4}>
                {c.processedByNode && (
                  <Tag color="purple" style={{ margin: 0, fontSize: 10 }}>
                    {c.processedByNode.nodeName}
                  </Tag>
                )}
                <Tag color={statusColor(c.cleanStatus)} style={{ margin: 0, fontSize: 11 }}>
                  {isActive ? '处理中' : c.cleanStatus === 'completed' ? '已完成' : c.cleanStatus === 'accepted' ? '已采纳' : c.cleanStatus === 'failed' ? '失败' : c.cleanStatus === 'needsReprocess' ? '待重做' : '待处理'}
                </Tag>
                {outLen != null && (
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>{outLen} 字</Typography.Text>
                )}
                {isDone && <Typography.Text type="success" style={{ fontSize: 11 }}>✓</Typography.Text>}
              </Space>
            </div>
          )
        })
      )}
    </div>
  )
}

// ── 子组件：工作节点列表 ──

interface NodeListPaneProps {
  sessions: NodeSession[]
  providers: { id: string; name: string; model?: string }[]
  selectedNode: string | null
  onPick: (nodeId: string) => void
}

function NodeListPane({ sessions, selectedNode, onPick }: NodeListPaneProps) {
  return (
    <div style={{ height: '100%', overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
      {sessions.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无工作中的节点" style={{ marginTop: 40 }} />
      ) : (
        sessions.map((s) => {
          const inFlight = s.assigned.length - s.done.size
          return (
            <div
              key={s.nodeId}
              onClick={() => onPick(s.nodeId)}
              style={{
                cursor: 'pointer',
                padding: '8px 10px',
                borderBottom: '1px solid #f0f0f0',
                background: selectedNode === s.nodeId ? '#e6f4ff' : undefined,
                opacity: s.idle ? 0.6 : 1,
              }}
            >
              <Typography.Text strong ellipsis style={{ maxWidth: 160, display: 'block', fontSize: 13 }}>
                {s.name}
              </Typography.Text>
              <Space size={6}>
                <Tag color={s.idle ? 'default' : 'processing'} style={{ margin: 0, fontSize: 11 }}>
                  {s.idle ? '本批完成' : '工作中'}
                </Tag>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  接手 {s.assigned.length} · 完成 {s.done.size} · 进行中 {inFlight}
                </Typography.Text>
              </Space>
            </div>
          )
        })
      )}
    </div>
  )
}
