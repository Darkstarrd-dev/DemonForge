import { useRef, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Col,
  InputNumber,
  List,
  Progress,
  Row,
  Segmented,
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
import { startCleanQueue, type CleanNode, type CleanQueueHandle } from '../../services/api'
import { ruleClean } from '../../utils/ruleClean'
import type { CleanStatus } from '../../services/types'

interface ActiveTask {
  chapterId: string
  nodeName: string
  acc: string
}

interface RuleStats {
  chapters: number
  deletions: number
  suspects: number
  payloads: string[]
}

export default function Step3Clean() {
  const { message } = App.useApp()
  const session = useAppStore((s) => s.importSession)
  const providers = useAppStore((s) => s.providers)
  const moduleMapping = useAppStore((s) => s.moduleMapping)
  const setState = useAppStore((s) => s.setState)

  const [mode, setMode] = useState<'ai' | 'rule'>('ai')
  const [rangeStart, setRangeStart] = useState(1)
  const [rangeEnd, setRangeEnd] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [active, setActive] = useState<ActiveTask[]>([])
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const [ruleStats, setRuleStats] = useState<RuleStats | null>(null)
  const handleRef = useRef<CleanQueueHandle | null>(null)

  if (!session) return null
  const chapters = session.chapters
  const total = chapters.length
  const end = rangeEnd ?? total
  const doneCount = chapters.filter((c) => c.cleanStatus === 'completed' || c.cleanStatus === 'accepted').length
  const enabledNodes = providers.filter((p) => p.enabled)

  // AI 清理可用节点：优先 m1Clean 映射指定的节点，否则所有已启用节点；要求 baseURL 与模型齐全
  const m1 = moduleMapping.m1Clean
  const usableProviders = (m1.nodeId ? providers.filter((p) => p.id === m1.nodeId) : enabledNodes).filter(
    (p) => p.baseURL.trim() && (m1.model.trim() || p.model.trim()),
  )
  const aiNodes: CleanNode[] = usableProviders.map((p) => ({
    name: p.name,
    baseURL: p.baseURL,
    apiKey: p.apiKey.trim() || undefined,
    model: m1.model.trim() || p.model,
  }))
  const concurrency = Math.min(8, Math.max(1, usableProviders.reduce((sum, p) => sum + p.maxConcurrency, 0)))

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

  // ── AI 路径：真实 LLM 流式清理 ──
  const startAi = () => {
    if (aiNodes.length === 0) {
      message.warning('没有可用的 AI 清理节点：请到「设置」启用至少一个 Provider（填好 Base URL 与模型），或为 M1 清理指定节点。')
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
      aiNodes,
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
      },
      concurrency,
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

  // ── 规则路径：非 LLM，本地瞬时清理 ──
  const runRule = () => {
    const cur = useAppStore.getState().importSession
    if (!cur) return
    const inRange = cur.chapters.slice(rangeStart - 1, end)
    const targetIds = new Set(
      inRange.filter((c) => c.cleanStatus === 'needsReprocess' || c.cleanStatus === 'pending').map((c) => c.id),
    )
    if (!targetIds.size) {
      message.info('范围内没有待清理章节（已清理章节如需重做请先在审核步标记重新处理）')
      return
    }
    let deletions = 0
    let suspects = 0
    const payloads = new Set<string>()
    const newChapters = cur.chapters.map((c) => {
      if (!targetIds.has(c.id)) return c
      const r = ruleClean(c.content)
      deletions += r.deletions.length
      suspects += r.suspects.length
      r.payloads.forEach((p) => payloads.add(p))
      return {
        ...c,
        cleanStatus: 'completed' as CleanStatus,
        cleanedContent: r.cleaned,
        lineDecisions: {},
      }
    })
    setState({ importSession: { ...cur, chapters: newChapters } })
    setRuleStats({ chapters: targetIds.size, deletions, suspects, payloads: [...payloads] })
    message.success(`规则清理完成 ${targetIds.size} 章，请进入审核步骤`)
  }

  const gotoReview = () =>
    setState({ importSession: { ...useAppStore.getState().importSession!, step: 3 } })

  const viewing = active.find((t) => t.chapterId === selectedTask) ?? active[0]
  const viewingChapter = viewing ? chapters.find((c) => c.id === viewing.chapterId) : null

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space wrap align="center">
        <Segmented
          value={mode}
          onChange={(v) => {
            setMode(v as 'ai' | 'rule')
            setRuleStats(null)
          }}
          disabled={running}
          options={[
            { label: 'AI 路径（真实 LLM）', value: 'ai' },
            { label: '规则路径（本地，非 LLM）', value: 'rule' },
          ]}
        />
        <Typography.Text>处理范围：第</Typography.Text>
        <InputNumber min={1} max={total} value={rangeStart} onChange={(v) => setRangeStart(v ?? 1)} />
        <Typography.Text>—</Typography.Text>
        <InputNumber min={rangeStart} max={total} value={end} onChange={(v) => setRangeEnd(v)} />
        <Typography.Text>章（共 {total} 章）</Typography.Text>
      </Space>

      {mode === 'ai' && (
        <Tag icon={<ThunderboltOutlined />} color={aiNodes.length ? 'blue' : 'red'}>
          并发 {concurrency}（节点：{aiNodes.map((n) => n.name).join('、') || '无可用，去设置配置'}）
        </Tag>
      )}
      {mode === 'rule' && (
        <Alert
          type="info"
          showIcon
          message="规则路径：本地确定性清理引擎（ruleClean），零 LLM 成本、瞬时完成。高置信噪声直接删除，低置信项仅标记交审核步把关。"
        />
      )}

      <Space>
        {mode === 'ai' ? (
          <>
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
          </>
        ) : (
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={runRule}>
            运行规则清理
          </Button>
        )}
        <Button disabled={doneCount === 0} onClick={gotoReview}>
          进入审核 →
        </Button>
      </Space>

      <Progress percent={total ? Math.round((doneCount / total) * 100) : 0} />
      <Typography.Text type="secondary">
        已完成 {doneCount} / {total} 章{mode === 'ai' ? ` · 活跃请求 ${active.length}` : ''}
      </Typography.Text>

      {mode === 'ai' && running && paused && (
        <Alert type="warning" showIcon message="已暂停：当前流式任务完成后不再取新任务。" />
      )}

      {mode === 'rule' && ruleStats && (
        <Alert
          type="success"
          showIcon
          message={`本次规则清理 ${ruleStats.chapters} 章：删除噪声 ${ruleStats.deletions} 处 · 低置信标记 ${ruleStats.suspects} 处 · 自锚定提取群号 ${ruleStats.payloads.length} 个`}
          description={
            ruleStats.payloads.length ? `提取群号：${ruleStats.payloads.join('、')}` : undefined
          }
        />
      )}

      {mode === 'ai' && (
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
      )}
    </Space>
  )
}
