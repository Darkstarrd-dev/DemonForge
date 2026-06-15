import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Collapse,
  Dropdown,
  Input,
  InputNumber,
  List,
  Progress,
  Radio,
  Row,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd'
import {
  CaretRightOutlined,
  PauseOutlined,
  StopOutlined,
  ThunderboltOutlined,
  PlusOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'
import { startCleanQueue, getDefaultPrompt, type CleanNode, type CleanQueueHandle, type CleanQueueDebugEvent } from '../../services/api'

interface ActiveTask {
  chapterId: string
  nodeName: string
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
  model?: string
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

export default function Step3Clean() {
  const { message } = App.useApp()
  const session = useAppStore((s) => s.importSession)
  const providers = useAppStore((s) => s.providers)
  const m1SystemPrompt = useAppStore((s) => s.m1SystemPrompt)
  const setState = useAppStore((s) => s.setState)

  const enabledNodes = useMemo(() => providers.filter((p) => p.enabled), [providers])

  /** 用户对节点参数的运行时修改（覆盖 ProviderNode 默认值） */
  const [overrides, setOverrides] = useState<Record<string, Partial<NodeRuntime>>>({})

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

  const [rangeStart, setRangeStart] = useState(1)
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
  const [batchColors, setBatchColors] = useState<Map<string, string>>(new Map())

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

  if (!session) return null
  const chapters = session.chapters
  const total = chapters.length
  const end = rangeEnd ?? total
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
    const inRange = chapters.slice(rangeStart - 1, end)
    return [
      ...inRange.filter((c) => c.cleanStatus === 'needsReprocess'),
      ...inRange.filter((c) => c.cleanStatus === 'pending'),
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
    targets.forEach((c) => patchChapter(c.id, { cleanStatus: 'pending' }))
    handleRef.current = startCleanQueue(
      targets.map((c) => ({ id: c.id, content: c.content })),
      cleanNodes,
      {
        onStart: (chapterId, nodeName, batchId) => {
          patchChapter(chapterId, { cleanStatus: 'processing' })
          const isAnchor = !!batchId
          if (batchId) {
            setBatchColors((prev) => {
              if (prev.has(batchId)) return prev
              const next = new Map(prev)
              next.set(batchId, `hsl(${Math.floor(Math.random() * 360)}, 40%, 82%)`)
              return next
            })
          }
          setActive((prev) => [...prev, { chapterId, nodeName, acc: '', batchId, isBatchAnchor: isAnchor }])
          setSelectedTask((sel) => sel ?? chapterId)
        },
        onChunk: (chapterId, acc) => {
          setActive((prev) => prev.map((t) => (t.chapterId === chapterId ? { ...t, acc } : t)))
        },
        onDone: (chapterId, cleaned) => {
          patchChapter(chapterId, { cleanStatus: 'completed', cleanedContent: cleaned, lineDecisions: {} })
          setActive((prev) => prev.filter((t) => t.chapterId !== chapterId))
          setSelectedTask((sel) => (sel === chapterId ? null : sel))
        },
        onError: (chapterId, msg) => {
          patchChapter(chapterId, { cleanStatus: 'failed' })
          setActive((prev) => prev.filter((t) => t.chapterId !== chapterId))
          setSelectedTask((sel) => (sel === chapterId ? null : sel))
          message.error(`「${chapters.find((c) => c.id === chapterId)?.title ?? chapterId}」清理失败：${msg}`)
        },
        onFinish: () => {
          setRunning(false)
          setActive([])
          message.success('清理完成，请进入审核步骤')
          // 自动前移 rangeStart 跳过已完成章节
          const curSession = useAppStore.getState().importSession
          if (curSession) {
            const nextIdx = curSession.chapters.findIndex(
              (c) => c.cleanStatus === 'pending' || c.cleanStatus === 'needsReprocess',
            )
            if (nextIdx >= 0) setRangeStart(nextIdx + 1)
          }
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
                model: evt.model,
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
      { systemPrompt: overridePrompt.trim() || m1SystemPrompt || undefined },
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

  const gotoReview = () =>
    setState({ importSession: { ...useAppStore.getState().importSession!, step: 3 } })

  const viewing = active.find((t) => t.chapterId === selectedTask) ?? active[0]
  const viewingChapter = viewing ? chapters.find((c) => c.id === viewing.chapterId) : null

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* 节点卡片列表 */}
      <div>
        <Typography.Title level={5} style={{ marginBottom: 8 }}>清理节点池</Typography.Title>
        {nodeRunStates.length === 0 ? (
          <Alert type="warning" showIcon message="无已启用节点，请先到设置页新增并配置节点" />
        ) : (
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
                          disabled={running}
                          onChange={(v) => updateNodeSetting(rs.nodeId, { participating: v })}
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
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>核心</Typography.Text>
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
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>批次</Typography.Text>
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
                          活跃 {active.filter((t) => {
                            const nodeP = providers.find((x) => x.id === rs.nodeId)
                            return t.nodeName === (nodeP?.name ?? '')
                          }).length} / {rs.concurrency}
                        </Typography.Text>
                      )}
                    </Space>
                  </Card>
                </Col>
              )
            })}
          </Row>
        )}
      </div>

      {/* 处理范围 */}
      <Space wrap align="center">
        <Typography.Text>处理范围：第</Typography.Text>
        <InputNumber min={1} max={total} value={rangeStart} onChange={(v) => setRangeStart(v ?? 1)} />
        <Typography.Text>—</Typography.Text>
        <InputNumber min={rangeStart} max={total} value={end} onChange={(v) => setRangeEnd(v)} />
        <Typography.Text>章（共 {total} 章）</Typography.Text>
      </Space>

      {/* 摘要 */}
      <Tag icon={<ThunderboltOutlined />} color={participatingNodes.length ? 'blue' : 'red'}>
        {participatingNodes.length ? `${participatingNodes.length} 个节点 · ` : '无参选节点'}
        {participatingNodes.map((s) => {
          const p = providers.find((x) => x.id === s.nodeId)
          return `${p?.name ?? s.nodeId}(${s.concurrency}核)`
        }).join(', ')}
      </Tag>

      {/* 操作按钮 */}
      <Space>
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
        已完成 {doneCount} / {total} 章 · 活跃请求 {active.length}
      </Typography.Text>

      {running && paused && (
        <Alert type="warning" showIcon message="已暂停：当前流式任务完成后不再取新任务。" />
      )}

      {/* 活跃任务 + 实时窗口 */}
      <Row gutter={16} style={{ height: 440 }}>
        <Col span={8} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Typography.Title level={5} style={{ marginBottom: 8 }}>活跃任务</Typography.Title>
          <div style={{ flex: 1, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
            {active.length === 0 ? (
              <Typography.Text type="secondary" style={{ display: 'block', padding: 12 }}>无活跃请求</Typography.Text>
            ) : (
              active.map((t) => {
                const ch = chapters.find((c) => c.id === t.chapterId)
                const batchColor = t.batchId ? batchColors.get(t.batchId) : undefined
                return (
                  <div
                    key={t.chapterId}
                    onClick={() => setSelectedTask(t.chapterId)}
                    style={{
                      cursor: 'pointer',
                      padding: '8px 10px',
                      borderBottom: '1px solid #f0f0f0',
                      background: viewing?.chapterId === t.chapterId ? '#e6f4ff' : undefined,
                      borderLeft: batchColor ? `4px solid ${batchColor}` : '4px solid transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <Typography.Text ellipsis style={{ maxWidth: 150, display: 'block', fontSize: 13 }}>
                        {ch?.title ?? t.chapterId}
                      </Typography.Text>
                      <Space size={4}>
                        <Tag color="processing" style={{ margin: 0, fontSize: 11 }}>{t.nodeName}</Tag>
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          {t.acc.length} 字
                        </Typography.Text>
                      </Space>
                    </div>
                    {t.isBatchAnchor && t.batchId && running && (
                      <Dropdown
                        trigger={['click']}
                        menu={{
                          items: enabledNodes.map((pn) => ({
                            key: pn.id,
                            label: `${pn.name} · ${pn.model || '—'}`,
                          })),
                          onClick: ({ key }) => {
                            handleRef.current?.switchBatchNode(t.batchId!, key)
                            // 更新活跃任务的 nodeName
                            const np = providers.find((x) => x.id === key)
                            if (np) {
                              setActive((prev) => prev.map((a) =>
                                a.batchId === t.batchId ? { ...a, nodeName: np.name } : a,
                              ))
                            }
                          },
                        }}
                      >
                        <Button size="small" type="text" icon={<SwapOutlined />} title="切换模型" />
                      </Dropdown>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </Col>
        <Col span={16} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Typography.Title level={5} style={{ marginBottom: 8 }}>实时窗口（左：发送原文 / 右：流式输出）</Typography.Title>
          <Row gutter={8} style={{ flex: 1 }}>
            <Col span={12} style={{ height: '100%' }}>
              <div className="stream-pane" style={{ background: '#1f2428', height: '100%', overflow: 'auto' }}>
                {viewingChapter ? viewingChapter.content : '（点击活跃任务查看）'}
              </div>
            </Col>
            <Col span={12} style={{ height: '100%' }}>
              <div className="stream-pane" style={{ height: '100%', overflow: 'auto' }}>
                {viewing ? viewing.acc || '等待响应…' : ''}
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

      {/* 调试日志 */}
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
