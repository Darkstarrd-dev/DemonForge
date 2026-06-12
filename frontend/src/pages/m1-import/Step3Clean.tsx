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
import { startCleanQueue, type CleanQueueHandle } from '../../services/api'

interface ActiveTask {
  chapterId: string
  nodeName: string
  acc: string
}

export default function Step3Clean() {
  const { message } = App.useApp()
  const session = useAppStore((s) => s.importSession)
  const providers = useAppStore((s) => s.providers)
  const setState = useAppStore((s) => s.setState)

  const [rangeStart, setRangeStart] = useState(1)
  const [rangeEnd, setRangeEnd] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [active, setActive] = useState<ActiveTask[]>([])
  const [selectedTask, setSelectedTask] = useState<string | null>(null)
  const handleRef = useRef<CleanQueueHandle | null>(null)

  if (!session) return null
  const chapters = session.chapters
  const total = chapters.length
  const end = rangeEnd ?? total
  const doneCount = chapters.filter((c) => c.cleanStatus === 'completed' || c.cleanStatus === 'accepted').length
  const enabledNodes = providers.filter((p) => p.enabled)
  const concurrency = Math.min(4, Math.max(1, enabledNodes.reduce((sum, p) => sum + p.maxConcurrency, 0)))

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

  const start = () => {
    // 待重处理优先，其次范围内 pending（M1 §3.4 重试队列优先机制的简化体现）
    const inRange = chapters.slice(rangeStart - 1, end)
    const targets = [
      ...inRange.filter((c) => c.cleanStatus === 'needsReprocess'),
      ...inRange.filter((c) => c.cleanStatus === 'pending'),
    ]
    if (!targets.length) {
      message.info('范围内没有待清理章节（已清理章节如需重做请先在审核步标记重新处理）')
      return
    }
    setRunning(true)
    setPaused(false)
    targets.forEach((c) => patchChapter(c.id, { cleanStatus: 'pending' }))
    handleRef.current = startCleanQueue(
      targets.map((c) => ({ id: c.id, content: c.content })),
      enabledNodes.map((n) => n.name),
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
    // 处理中的章节回滚为待处理
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

  const viewing = active.find((t) => t.chapterId === selectedTask) ?? active[0]
  const viewingChapter = viewing ? chapters.find((c) => c.id === viewing.chapterId) : null

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space wrap align="center">
        <Typography.Text>处理范围：第</Typography.Text>
        <InputNumber min={1} max={total} value={rangeStart} onChange={(v) => setRangeStart(v ?? 1)} />
        <Typography.Text>—</Typography.Text>
        <InputNumber min={rangeStart} max={total} value={end} onChange={(v) => setRangeEnd(v)} />
        <Typography.Text>章（共 {total} 章）</Typography.Text>
        <Tag icon={<ThunderboltOutlined />} color="blue">
          并发 {concurrency}（启用节点：{enabledNodes.map((n) => n.name).join('、') || '无'}）
        </Tag>
      </Space>
      <Space>
        {!running && (
          <Button type="primary" icon={<CaretRightOutlined />} onClick={start}>
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
        <Button
          disabled={doneCount === 0}
          onClick={() => setState({ importSession: { ...useAppStore.getState().importSession!, step: 3 } })}
        >
          进入审核 →
        </Button>
      </Space>

      <Progress percent={total ? Math.round((doneCount / total) * 100) : 0} />
      <Typography.Text type="secondary">
        已完成 {doneCount} / {total} 章 · 活跃请求 {active.length}
      </Typography.Text>

      {running && paused && <Alert type="warning" showIcon message="已暂停：当前流式任务完成后不再取新任务。" />}

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
    </Space>
  )
}
