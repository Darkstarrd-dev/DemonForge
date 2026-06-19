import { useState, useMemo } from 'react'
import { Alert, App, Button, Card, Checkbox, List, Progress, Space, Tag, Typography } from 'antd'
import { ThunderboltOutlined, PauseOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'
import { startBatchGenerate, type BatchGenTask, type BatchGenNode, type BatchGenHandle } from '../../services/api'

type TaskState = {
  id: string
  title: string
  status: 'pending' | 'drafting' | 'finalizing' | 'completed' | 'failed'
  progress: string
  error?: string
}

export default function BatchGeneratePage() {
  const { message } = App.useApp()
  const currentBookId = useAppStore((s) => s.currentBookId)
  const outline = useAppStore((s) => s.outline)
  const providers = useAppStore((s) => s.providers)
  const books = useAppStore((s) => s.books)
  const setState = useAppStore((s) => s.setState)

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [handle, setHandle] = useState<BatchGenHandle | null>(null)
  const [taskStates, setTaskStates] = useState<Map<string, TaskState>>(new Map())

  const bookOutline = outline.filter((o) => o.bookId === currentBookId).sort((a, b) => a.order - b.order)
  const enabledNodes = providers.filter((p) => p.enabled)
  const book = books.find((b) => b.id === currentBookId)

  const batchNodes: BatchGenNode[] = useMemo(
    () =>
      enabledNodes.map((p) => ({
        id: p.id,
        name: p.name,
        baseURL: p.baseURL,
        apiKey: p.apiKey?.trim() || undefined,
        model: p.model,
        maxConcurrency: p.maxConcurrency,
        intervalSec: p.intervalSec,
      })),
    [enabledNodes],
  )

  const startBatch = async () => {
    if (!currentBookId) {
      message.warning('请先选择作品')
      return
    }
    if (selectedIds.length === 0) {
      message.warning('请至少选择一个章节')
      return
    }
    if (enabledNodes.length === 0) {
      message.warning('无可用节点，请到设置页启用')
      return
    }

    // 构建任务列表
    const tasks: BatchGenTask[] = selectedIds.map((id) => {
      const node = bookOutline.find((o) => o.id === id)!
      return {
        chapterId: id,
        outlineNodeId: id,
        draftContext: {
          bookId: currentBookId,
          chapterIndex: node.order,
          // 简化版：不传 rag/sceneId/targetCharacterId
        },
        existingGlobalSummary: book?.globalSummary,
        existingStates: '[]', // 简化版：不传状态
      }
    })

    // 初始化任务状态
    const initialStates = new Map<string, TaskState>()
    for (const id of selectedIds) {
      const node = bookOutline.find((o) => o.id === id)!
      initialStates.set(id, {
        id,
        title: node.title,
        status: 'pending',
        progress: '',
      })
    }
    setTaskStates(initialStates)
    setRunning(true)
    setPaused(false)

    const callbacks = {
      onStart: (chapterId, _nodeName, phase) => {
        setTaskStates((prev) => {
          const next = new Map(prev)
          const task = next.get(chapterId)
          if (task) {
            task.status = phase
            task.progress = phase === 'drafting' ? '生成中...' : '定稿中...'
          }
          return next
        })
      },
      onDraftChunk: (chapterId, acc) => {
        setTaskStates((prev) => {
          const next = new Map(prev)
          const task = next.get(chapterId)
          if (task) {
            task.progress = `${acc.length} 字`
          }
          return next
        })
      },
      onFinalizeChunk: (chapterId, acc) => {
        setTaskStates((prev) => {
          const next = new Map(prev)
          const task = next.get(chapterId)
          if (task) {
            task.progress = `定稿中... ${acc.length} 字`
          }
          return next
        })
      },
      onComplete: (chapterId, result) => {
        setTaskStates((prev) => {
          const next = new Map(prev)
          const task = next.get(chapterId)
          if (task) {
            task.status = 'completed'
            task.progress = `完成 (${result.draftText.length} 字)`
          }
          return next
        })

        // 保存到 store（简化版：仅保存正文，摘要/状态事件由用户手动处理）
        const node = bookOutline.find((o) => o.id === chapterId)
        if (node) {
          const now = new Date().toISOString()
          setState({
            chapters: [
              ...useAppStore.getState().chapters,
              {
                id: chapterId,
                bookId: currentBookId,
                index: node.order,
                title: `第${node.order}章 ${node.title}`,
                content: result.draftText,
                status: 'draft' as const,
                outlineNodeId: node.id,
                summary: result.chapterSummary,
                updatedAt: now,
              },
            ],
          })
        }
      },
      onError: (chapterId, error) => {
        setTaskStates((prev) => {
          const next = new Map(prev)
          const task = next.get(chapterId)
          if (task) {
            task.status = 'failed'
            task.error = error
          }
          return next
        })
        message.error(`章节 ${chapterId} 失败：${error}`)
      },
      onFinish: () => {
        setRunning(false)
        setPaused(false)
        setHandle(null)
        const completed = Array.from(taskStates.values()).filter((t) => t.status === 'completed').length
        message.success(`批量生成完成：${completed}/${selectedIds.length} 章`)
      },
    }
    const h = startBatchGenerate(tasks, batchNodes, callbacks, {
      isNodeAvailable: (id: string) => useAppStore.getState().consumeProviderUsage(id),
    })

    setHandle(h)
  }

  const togglePause = () => {
    if (!handle) return
    if (paused) {
      handle.resume()
      setPaused(false)
    } else {
      handle.pause()
      setPaused(true)
    }
  }

  const stop = () => {
    if (!handle) return
    handle.stop()
    setRunning(false)
    setPaused(false)
    setHandle(null)
    message.info('已停止批量生成')
  }

  const statusColor = (status: TaskState['status']) => {
    switch (status) {
      case 'pending':
        return 'default'
      case 'drafting':
      case 'finalizing':
        return 'processing'
      case 'completed':
        return 'success'
      case 'failed':
        return 'error'
    }
  }

  const statusText = (status: TaskState['status']) => {
    switch (status) {
      case 'pending':
        return '等待中'
      case 'drafting':
        return '生成中'
      case 'finalizing':
        return '定稿中'
      case 'completed':
        return '已完成'
      case 'failed':
        return '失败'
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="批量章节生成"
        description="选择大纲节点批量生成章节，每章自动执行 draft（生成正文）→ finalize（提取摘要+状态）流程。失败时立即停止以避免剧情崩坏。"
      />

      <Card size="small" title="章节选择">
        <Checkbox.Group
          value={selectedIds}
          onChange={(v) => setSelectedIds(v as string[])}
          disabled={running}
          style={{ width: '100%' }}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            {bookOutline.map((node) => (
              <Checkbox key={node.id} value={node.id}>
                第 {node.order} 章 {node.title}
              </Checkbox>
            ))}
          </Space>
        </Checkbox.Group>

        {bookOutline.length === 0 && <Typography.Text type="secondary">当前作品无大纲，请先在 M0 立项生成蓝图</Typography.Text>}
      </Card>

      <Card size="small" title="节点配置">
        <Typography.Text type="secondary">
          {enabledNodes.length} 个节点已启用，总并发：{batchNodes.reduce((sum, n) => sum + n.maxConcurrency, 0)}
        </Typography.Text>
        {enabledNodes.length === 0 && (
          <Typography.Text type="warning"> （无可用节点，请到设置页启用）</Typography.Text>
        )}
      </Card>

      <Card size="small" title="控制">
        <Space>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={startBatch}
            disabled={running || selectedIds.length === 0 || enabledNodes.length === 0}
          >
            开始批量生成
          </Button>
          <Button icon={paused ? <PlayCircleOutlined /> : <PauseOutlined />} onClick={togglePause} disabled={!running}>
            {paused ? '继续' : '暂停'}
          </Button>
          <Button icon={<StopOutlined />} onClick={stop} disabled={!running} danger>
            停止
          </Button>
        </Space>
      </Card>

      {taskStates.size > 0 && (
        <Card size="small" title="进度">
          <List
            size="small"
            dataSource={Array.from(taskStates.values())}
            renderItem={(task) => (
              <List.Item>
                <Space style={{ width: '100%' }} direction="vertical" size={4}>
                  <Space>
                    <Typography.Text strong>{task.title}</Typography.Text>
                    <Tag color={statusColor(task.status)}>{statusText(task.status)}</Tag>
                  </Space>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {task.progress || '—'}
                  </Typography.Text>
                  {task.error && <Typography.Text type="danger" style={{ fontSize: 12 }}>{task.error}</Typography.Text>}
                </Space>
              </List.Item>
            )}
          />
          <div style={{ marginTop: 12 }}>
            <Progress
              percent={Math.round(
                (Array.from(taskStates.values()).filter((t) => t.status === 'completed').length / taskStates.size) * 100,
              )}
              status={running ? 'active' : 'success'}
            />
          </div>
        </Card>
      )}
    </Space>
  )
}
