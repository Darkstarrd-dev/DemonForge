import { useRef, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Col,
  Collapse,
  Input,
  InputNumber,
  List,
  Progress,
  Radio,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import {
  CaretRightOutlined,
  PauseOutlined,
  StopOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'
import { startCleanQueue, type CleanNode, type CleanQueueHandle, type CleanQueueDebugEvent } from '../../services/api'

interface ActiveTask {
  chapterId: string
  nodeName: string
  acc: string
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

export default function Step3Clean() {
  const { message } = App.useApp()
  const session = useAppStore((s) => s.importSession)
  const providers = useAppStore((s) => s.providers)
  const moduleMapping = useAppStore((s) => s.moduleMapping)
  const m1SystemPrompt = useAppStore((s) => s.m1SystemPrompt)
  const setState = useAppStore((s) => s.setState)

  const [selNodeId, setSelNodeId] = useState<string | null>(null)
  const [concurrency, setConcurrency] = useState(2)
  const [batchSize, setBatchSize] = useState(1)
  const [intervalSec, setIntervalSec] = useState(0)
  const [rangeStart, setRangeStart] = useState(1)
  const [rangeEnd, setRangeEnd] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [active, setActive] = useState<ActiveTask[]>([])
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([])
  const [logFilter, setLogFilter] = useState<'all' | 'request' | 'response' | 'error'>('all')
  const [overridePrompt, setOverridePrompt] = useState('')
  const debugIdRef = useRef(0)
  const handleRef = useRef<CleanQueueHandle | null>(null)

  if (!session) return null
  const chapters = session.chapters
  const total = chapters.length
  const end = rangeEnd ?? total
  const doneCount = chapters.filter((c) => c.cleanStatus === 'completed' || c.cleanStatus === 'accepted').length
  const enabledNodes = providers.filter((p) => p.enabled)

  // 选中节点：优先 selNodeId；否则取设置页「M1 文本清理」映射节点；再否则首个已启用节点
  const mappedM1 = moduleMapping.m1Clean.nodeId
  const defaultNodeId = mappedM1 && providers.some((p) => p.id === mappedM1) ? mappedM1 : enabledNodes[0]?.id ?? null
  const effectiveNodeId = selNodeId ?? defaultNodeId
  const selectedNode = effectiveNodeId ? providers.find((p) => p.id === effectiveNodeId) ?? null : null
  const aiNode: CleanNode | null = selectedNode
    ? {
        name: selectedNode.name,
        baseURL: selectedNode.baseURL,
        apiKey: selectedNode.apiKey.trim() || undefined,
        model: selectedNode.model,
      }
    : null
  const nodeOptions = enabledNodes.map((p) => ({ value: p.id, label: `${p.name} · ${p.model || '（未设模型）'}` }))

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

  const startAi = () => {
    if (!aiNode || !aiNode.baseURL.trim() || !aiNode.model.trim()) {
      message.warning('请先选择一个已配置 Base URL 与模型的节点')
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
      [aiNode],
      {
        onStart: (chapterId, nodeName) => {
          patchChapter(chapterId, { cleanStatus: 'processing' })
          setActive((prev) => [...prev, { chapterId, nodeName, acc: '' }])
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
      { concurrency, batchSize, intervalSec, systemPrompt: overridePrompt.trim() || m1SystemPrompt || undefined },
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

  const gotoReview = () =>
    setState({ importSession: { ...useAppStore.getState().importSession!, step: 3 } })

  const viewing = active.find((t) => t.chapterId === selectedTask) ?? active[0]
  const viewingChapter = viewing ? chapters.find((c) => c.id === viewing.chapterId) : null

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space wrap align="center">
        <Typography.Text>节点：</Typography.Text>
        <Select
          style={{ minWidth: 220 }}
          value={effectiveNodeId ?? undefined}
          placeholder="选择 Provider 节点"
          options={nodeOptions}
          disabled={running}
          onChange={(v) => setSelNodeId(v)}
          notFoundContent={
            <Typography.Text type="secondary">无已启用节点，请到设置新增</Typography.Text>
          }
        />
        <Typography.Text>最大并发：</Typography.Text>
        <InputNumber min={1} max={32} value={concurrency} disabled={running} onChange={(v) => setConcurrency(v ?? 1)} />
        <Typography.Text>单次章节数：</Typography.Text>
        <InputNumber min={1} max={10} value={batchSize} disabled={running} onChange={(v) => setBatchSize(v ?? 1)} />
        <Typography.Text>请求间隔(秒)：</Typography.Text>
        <InputNumber min={0} max={60} value={intervalSec} disabled={running} onChange={(v) => setIntervalSec(v ?? 0)} />
      </Space>

      <Space wrap align="center">
        <Typography.Text>处理范围：第</Typography.Text>
        <InputNumber min={1} max={total} value={rangeStart} onChange={(v) => setRangeStart(v ?? 1)} />
        <Typography.Text>—</Typography.Text>
        <InputNumber min={rangeStart} max={total} value={end} onChange={(v) => setRangeEnd(v)} />
        <Typography.Text>章（共 {total} 章）</Typography.Text>
      </Space>

      <Tag icon={<ThunderboltOutlined />} color={aiNode ? 'blue' : 'red'}>
        并发 {concurrency} · 节点：{aiNode?.name ?? '无可用，去设置配置'}
      </Tag>

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
      </Space>

      <Progress percent={total ? Math.round((doneCount / total) * 100) : 0} />
      <Typography.Text type="secondary">
        已完成 {doneCount} / {total} 章 · 活跃请求 {active.length}
      </Typography.Text>

      {running && paused && (
        <Alert type="warning" showIcon message="已暂停：当前流式任务完成后不再取新任务。" />
      )}

      <Row gutter={16}>
        <Col span={8}>
          <Typography.Title level={5}>活跃任务</Typography.Title>
          <List
            size="small"
            bordered
            dataSource={active}
            locale={{ emptyText: '无活跃请求' }}
            renderItem={(t) => {
              const ch = chapters.find((c) => c.id === t.chapterId)
              return (
                <List.Item
                  style={{
                    cursor: 'pointer',
                    background: viewing?.chapterId === t.chapterId ? '#e6f4ff' : undefined,
                  }}
                  onClick={() => setSelectedTask(t.chapterId)}
                >
                  <Space direction="vertical" size={0} style={{ width: '100%' }}>
                    <Typography.Text ellipsis style={{ maxWidth: 200 }}>
                      {ch?.title ?? t.chapterId}
                    </Typography.Text>
                    <Space size={4}>
                      <Tag color="processing" style={{ margin: 0 }}>
                        {t.nodeName}
                      </Tag>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {t.acc.length} 字
                      </Typography.Text>
                    </Space>
                  </Space>
                </List.Item>
              )
            }}
          />
        </Col>
        <Col span={16}>
          <Typography.Title level={5}>实时窗口（左：发送原文 / 右：AI 流式输出）</Typography.Title>
          <Row gutter={8}>
            <Col span={12}>
              <div className="stream-pane" style={{ background: '#1f2428' }}>
                {viewingChapter ? viewingChapter.content : '（点击活跃任务查看）'}
              </div>
            </Col>
            <Col span={12}>
              <div className="stream-pane">{viewing ? viewing.acc || '等待响应…' : ''}</div>
            </Col>
          </Row>
        </Col>
      </Row>

      <Collapse
        items={[
          {
            key: 'prompt',
            label: '清理提示词（本次）',
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
                    生效优先级：本次覆盖 &gt; 设置页默认 &gt; 后端内置
                  </Typography.Text>
                </Space>
              </>
            ),
          },
        ]}
        style={{ background: '#fafafa' }}
      />

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
