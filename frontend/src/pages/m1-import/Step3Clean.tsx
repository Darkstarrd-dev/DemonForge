// M1 文本清理 · 步骤 3 主组件。
// 从原 1352 行巨组件重构为编排层：组合 useCleanRun + 6 个子面板（hooks + 5 UI panels）。
// 状态分层：
//   - 编排级：rangeStart/End、nodePoolOpen、listTab、selectedTask/Node、debugEntries、promptModal state
//   - 调度级：useCleanRun 内部（cleanRun、accMap、handleRef、chapterNode）
//   - 节点级：cleanNodeOverrides（store 持久化）
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App, Alert, Button, Collapse, Grid, Progress, Row, Space, Switch, Tag, Typography } from 'antd'
import {
  CaretRightOutlined,
  PauseOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { resolveProviderNodes } from '../../utils/providerResolver'
import { useCleanRun, useDefaultPromptLoader, type NodeRuntime } from './clean/hooks/useCleanRun'
import NodePoolPanel from './clean/NodePoolPanel'
import ChapterTabsPanel, { type ListTabKey } from './clean/ChapterTabsPanel'
import LiveWindowPanel from './clean/LiveWindowPanel'
import DebugLogPanel, { type DebugEntry, type DebugFilter } from './clean/DebugLogPanel'
import PromptModals from './clean/PromptModals'
import DebouncedInputNumber from './clean/DebouncedInputNumber'

export default function Step3Clean() {
  const screens = Grid.useBreakpoint()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const session = useAppStore((s) => s.importSession)
  const providers = useAppStore((s) => s.providers)
  const providerNodes = useAppStore((s) => s.providerNodes)
  const m1SystemPrompt = useAppStore((s) => s.m1SystemPrompt)
  const m1AutoRetry = useAppStore((s) => s.m1AutoRetry)
  const m1TestText = useAppStore((s) => s.m1TestText)
  const cleanRun = useAppStore((s) => s.cleanRun)
  const overrides = useAppStore((s) => s.cleanNodeOverrides)
  const resolvedNodes = useMemo(() => resolveProviderNodes({ providers, providerNodes }), [providers, providerNodes])

  useDefaultPromptLoader()

  const enabledNodes = useMemo(
    () => resolvedNodes.filter((p) => p.enabled && p.nodeType === 'text'),
    [resolvedNodes],
  )

  /** 节点运行时覆盖 = ProviderNode 默认 + 用户覆盖 */
  const nodeRunStates: NodeRuntime[] = useMemo(
    () =>
      enabledNodes.map((p) => {
        const o = overrides[p.id] ?? {}
        return {
          nodeId: p.id,
          participating: o.participating ?? true,
          concurrency: o.concurrency ?? p.maxConcurrency,
          batchChars: o.batchChars ?? p.batchChars,
          intervalSec: o.intervalSec ?? p.intervalSec,
        }
      }),
    [enabledNodes, overrides],
  )

  const [rangeStart, setRangeStart] = useState<number | null>(1)
  const [rangeEnd, setRangeEnd] = useState<number | null>(null)
  const [bulkConcurrency, setBulkConcurrency] = useState<number | null>(null)
  const [bulkBatchChars, setBulkBatchChars] = useState<number | null>(null)
  const [bulkIntervalSec, setBulkIntervalSec] = useState<number | null>(null)
  const [nodePoolOpen, setNodePoolOpen] = useState(true)
  const [listTab, setListTab] = useState<ListTabKey>('pending')
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([])
  const [logFilter, setLogFilter] = useState<DebugFilter>('all')
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [draftPrompt, setDraftPrompt] = useState('')
  const [testTextModalOpen, setTestTextModalOpen] = useState(false)
  const [draftTestText, setDraftTestText] = useState('')

  const debugBufferRef = useRef<DebugEntry[]>([])
  const debugIdRef = useRef(0)
  const accMapRef = useRef<Map<string, string>>(new Map())
  const viewingIdRef = useRef<string | undefined>(undefined)
  const [liveAcc, setLiveAcc] = useState('')

  // 卷标记章（skipClean）跳过 LLM 清理：直接置 completed 且原样保留正文
  useEffect(() => {
    const cur = useAppStore.getState().importSession
    if (!cur) return
    const dirty = cur.chapters.filter((c) => c.skipClean && c.cleanStatus !== 'completed')
    if (dirty.length === 0) return
    useAppStore.getState().setState({
      importSession: {
        ...cur,
        chapters: cur.chapters.map((c) =>
          c.skipClean && c.cleanStatus !== 'completed'
            ? { ...c, cleanStatus: 'completed', cleanedContent: c.content, lineDecisions: {} }
            : c,
        ),
      },
    })
  }, [session?.chapters])

  // 开始清理后自动折叠节点池（保留原行为）
  const running = cleanRun?.running ?? false
  const paused = cleanRun?.paused ?? false
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 响应 store 运行态变化折叠节点池
    if (running) setNodePoolOpen(false)
  }, [running])

  // 150ms 定时刷新：从 accMapRef 读取选中章节的流式文本写入 liveAcc；合并 debug 缓冲
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const curId = viewingIdRef.current
      if (curId) {
        const curAcc = accMapRef.current.get(curId) ?? ''
        setLiveAcc((prev) => (prev === curAcc ? prev : curAcc))
      } else {
        setLiveAcc('')
      }
      const buf = debugBufferRef.current
      if (buf.length) {
        debugBufferRef.current = []
        setDebugEntries((prev) => {
          const next = [...prev, ...buf]
          return next.slice(-200)
        })
      }
    }, 150)
    return () => clearInterval(id)
  }, [running])

  // 派生数据（useMemo 必须在 early return 之前，遵守 hook 调用顺序）
  const chapters2 = useMemo(() => session?.chapters ?? [], [session?.chapters])
  const pendingNotProcessing = useMemo(
    () =>
      chapters2.filter(
        (c) => c.cleanStatus === 'pending' || c.cleanStatus === 'needsReprocess' || c.cleanStatus === 'failed',
      ),
    [chapters2],
  )
  const pendingCount = pendingNotProcessing.length
  const doneCount = useMemo(
    () => chapters2.filter((c) => c.cleanStatus === 'completed' || c.cleanStatus === 'accepted').length,
    [chapters2],
  )
  const participatingNodes = useMemo(() => nodeRunStates.filter((s) => s.participating), [nodeRunStates])
  const pendingChapters = useMemo(
    () =>
      chapters2.filter(
        (c) =>
          c.cleanStatus === 'pending' ||
          c.cleanStatus === 'processing' ||
          c.cleanStatus === 'needsReprocess' ||
          c.cleanStatus === 'failed',
      ),
    [chapters2],
  )
  const doneChapters = useMemo(
    () => chapters2.filter((c) => c.cleanStatus === 'completed' || c.cleanStatus === 'accepted'),
    [chapters2],
  )

  const start = Math.max(1, Math.min(rangeStart ?? 1, pendingCount))
  const end = Math.min(rangeEnd ?? pendingCount, pendingCount)
  const rangeTargetChapters = useMemo(() => {
    const slice = pendingNotProcessing.slice(start - 1, end)
    return [
      ...slice.filter((c) => c.cleanStatus === 'needsReprocess'),
      ...slice.filter((c) => c.cleanStatus === 'failed'),
      ...slice.filter((c) => c.cleanStatus === 'pending'),
    ]
  }, [pendingNotProcessing, start, end])

  const active = useMemo(() => cleanRun?.active ?? [], [cleanRun?.active])
  const nodeSessions = useMemo(() => cleanRun?.nodeSessions ?? [], [cleanRun?.nodeSessions])
  const activeIds = useMemo(() => new Set(active.map((a) => a.chapterId)), [active])
  const activeIdsEmpty = useMemo(() => new Set<string>(), [])

  const viewing = active.find((t) => t.chapterId === selectedTask) ?? active[0]
  useEffect(() => {
    viewingIdRef.current = viewing?.chapterId
  }, [viewing?.chapterId])

  const selectedSession = nodeSessions.find((s) => s.sessionKey === selectedNode) ?? null
  const nodeTaskChapters = useMemo(
    () =>
      selectedSession
        ? selectedSession.assigned
            .map((cid) => chapters2.find((c) => c.id === cid))
            .filter((c): c is (typeof chapters2)[number] => Boolean(c))
        : [],
    [selectedSession, chapters2],
  )
  const doneSet = useMemo(() => (selectedSession ? new Set(selectedSession.done) : undefined), [selectedSession])

  const viewingChapter = viewing
    ? chapters2.find((c) => c.id === viewing.chapterId)
    : selectedTask
      ? chapters2.find((c) => c.id === selectedTask)
      : null

  // 按 nodeName 聚合的活跃数（供节点池卡片显示"活跃 N / concurrency"）
  const activeCountByNodeName = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of active) {
      if (!t.nodeName) continue
      m.set(t.nodeName, (m.get(t.nodeName) ?? 0) + 1)
    }
    return m
  }, [active])

  // 状态颜色映射
  const statusColor = (st: string) =>
    st === 'completed' || st === 'accepted'
      ? 'green'
      : st === 'processing'
        ? 'processing'
        : st === 'failed'
          ? 'red'
          : st === 'needsReprocess'
            ? 'orange'
            : 'default'

  const getChapterTitle = useCallback(
    (chapterId: string) => chapters2.find((c) => c.id === chapterId)?.title ?? chapterId,
    [chapters2],
  )

  // 调试事件桥：useCleanRun 把上游 debug 事件 push 到本组件 buffer，由 150ms 定时器合并写 setDebugEntries
  const onDebugEvent = useCallback((evt: import('../../services/api').CleanQueueDebugEvent) => {
    debugIdRef.current += 1
    const title = evt.chapterTitle ?? chapters2.find((c) => c.id === evt.chapterId)?.title ?? evt.chapterId
    debugBufferRef.current.push({
      chapterId: evt.chapterId,
      id: debugIdRef.current,
      title,
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
    })
  }, [chapters2])

  // 节点单参数更新
  const onUpdateNodeSetting = (nodeId: string, patch: Partial<NodeRuntime>) => {
    useAppStore.getState().setState({
      cleanNodeOverrides: {
        ...useAppStore.getState().cleanNodeOverrides,
        [nodeId]: { ...(useAppStore.getState().cleanNodeOverrides[nodeId] ?? {}), ...patch },
      },
    })
  }

  const {
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
  } = useCleanRun({
    message,
    rangeTargets: rangeTargetChapters,
    nodeRunStates,
    testText: m1TestText,
    m1SystemPrompt,
    autoRetry: m1AutoRetry,
    getChapterTitle,
    selectedTask,
    setSelectedTask,
    selectedNode,
    setSelectedNode,
    onDebug: onDebugEvent,
  })

  if (!session) return null
  const total = chapters2.length

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', gap: 16 }}>
      {/* 节点池（顶部） */}
      <Collapse
        activeKey={nodePoolOpen ? ['nodes'] : []}
        onChange={(keys) => setNodePoolOpen((Array.isArray(keys) ? keys : [keys]).includes('nodes') as never)}
        items={[
          {
            key: 'nodes',
            label: <span />,
            showArrow: false,
            children: (
              <NodePoolPanel
                open={nodePoolOpen}
                onOpenChange={setNodePoolOpen}
                nodeRunStates={nodeRunStates}
                resolvedNodes={resolvedNodes}
                activeCountByNodeName={activeCountByNodeName}
                onOpenPromptModal={() => {
                  const s = useAppStore.getState()
                  setDraftPrompt(s.promptOverrides['m1-clean'] || s.m1SystemPrompt || '')
                  setPromptModalOpen(true)
                }}
                onOpenTestTextModal={() => {
                  setDraftTestText(m1TestText)
                  setTestTextModalOpen(true)
                }}
                onRunBatchCleanTest={runBatchCleanTest}
                batchTesting={batchTesting}
                bulkConcurrency={bulkConcurrency}
                setBulkConcurrency={setBulkConcurrency}
                bulkBatchChars={bulkBatchChars}
                setBulkBatchChars={setBulkBatchChars}
                bulkIntervalSec={bulkIntervalSec}
                setBulkIntervalSec={setBulkIntervalSec}
                onApplyBulk={() => applyBulkToAll({ concurrency: bulkConcurrency, batchChars: bulkBatchChars, intervalSec: bulkIntervalSec })}
                onToggleParticipating={toggleParticipating}
                onUpdateNodeSetting={onUpdateNodeSetting}
                running={running}
                onHotUpdateNodes={hotUpdateNodes}
              />
            ),
          },
        ]}
      />

      {/* 处理范围 */}
      <Space wrap align="center">
        <Typography.Text>处理范围：第</Typography.Text>
        <DebouncedInputNumber
          min={1}
          max={Math.max(1, rangeEnd ?? pendingCount)}
          value={rangeStart}
          onCommit={(v) => {
            setRangeStart(v)
            if (v != null && rangeEnd != null && v > rangeEnd) setRangeEnd(null)
          }}
          style={{ width: 70 }}
          placeholder="1"
        />
        <Typography.Text>—</Typography.Text>
        <DebouncedInputNumber
          min={rangeStart ?? 1}
          max={pendingCount}
          value={rangeEnd}
          onCommit={setRangeEnd}
          style={{ width: 70 }}
          placeholder={String(pendingCount)}
        />
        <Typography.Text>章（待处理 {pendingCount} · 已处理 {doneCount} · 共 {total}）</Typography.Text>
      </Space>

      {/* 摘要 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <Tag icon={<ThunderboltOutlined />} color={participatingNodes.length ? 'blue' : 'red'}>
          {participatingNodes.length ? `${participatingNodes.length} 个节点` : '无参选节点'}
        </Tag>
        {participatingNodes.map((s) => {
          const p = resolvedNodes.find((x) => x.id === s.nodeId)
          return (
            <Tag key={s.nodeId}>
              {p?.name ?? s.nodeId}({s.concurrency}进程/{Math.round(s.batchChars / 1000)}K字)
            </Tag>
          )
        })}
      </div>

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
        <Button icon={<ReloadOutlined />} onClick={retryFailed}>
          重试失败章
        </Button>
        <Switch
          checkedChildren="自动重试"
          unCheckedChildren="自动重试"
          checked={m1AutoRetry}
          onChange={(v) => useAppStore.getState().setState({ m1AutoRetry: v })}
        />
        <Button disabled={doneCount === 0} onClick={gotoReview}>
          进入审核 →
        </Button>
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() => {
            const cur = useAppStore.getState().importSession
            if (cur?.targetBookId) {
              navigate('/settings')
            } else {
              useAppStore.getState().setState({ importSession: { ...cur!, step: 1, fileName: '' } })
            }
          }}
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
      <Row gutter={[16, 16]} style={{ minHeight: 460, flex: '1 1 460px', overflow: 'hidden' }}>
        <ChapterTabsPanel
          screens={screens}
          listTab={listTab}
          setListTab={setListTab}
          pendingChapters={pendingChapters}
          doneChapters={doneChapters}
          selectedSession={selectedSession}
          nodeTaskChapters={nodeTaskChapters}
          doneSet={doneSet}
          selectedTask={selectedTask}
          setSelectedTask={setSelectedTask}
          activeIds={activeIds}
          activeIdsEmpty={activeIdsEmpty}
          statusColor={statusColor}
          nodeSessions={nodeSessions}
          selectedNode={selectedNode}
          onPickNode={(k) => {
            setSelectedNode(k)
            setListTab('nodeTasks')
          }}
        />
        <LiveWindowPanel
          viewingChapter={viewingChapter ? {
            title: viewingChapter.title,
            content: viewingChapter.content,
            cleanStatus: viewingChapter.cleanStatus,
            cleanedContent: viewingChapter.cleanedContent,
          } : null}
          streaming={Boolean(viewing)}
          liveAcc={liveAcc}
        />
      </Row>

      {/* 调试日志 */}
      <Collapse
        items={[
          {
            key: 'debug',
            label: `请求/响应日志 (${debugEntries.length})`,
            children: (
              <DebugLogPanel
                entries={debugEntries}
                filter={logFilter}
                onChangeFilter={setLogFilter}
                onClear={() => setDebugEntries([])}
              />
            ),
          },
        ]}
      />

      {/* 弹窗：清理提示词 + 测试文本 */}
      <PromptModals
        promptOpen={promptModalOpen}
        setPromptOpen={setPromptModalOpen}
        draftPrompt={draftPrompt}
        setDraftPrompt={setDraftPrompt}
        testTextOpen={testTextModalOpen}
        setTestTextOpen={setTestTextModalOpen}
        draftTestText={draftTestText}
        setDraftTestText={setDraftTestText}
        currentTestText={m1TestText}
        message={message}
      />
    </div>
  )
}
