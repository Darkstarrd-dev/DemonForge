import { useState, useRef } from 'react'
import {
  App,
  Button,
  Card,
  Input,
  Space,
  Typography,
  Segmented,
  Badge,
  Divider,
} from 'antd'
import {
  PlusOutlined,
  SendOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  DownloadOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'
import type { RoleChatMode, RoleChatParticipant, RoleChatMessage } from '../../services/types'
import AddParticipantModal from './components/AddParticipantModal'
import MessageList from './components/MessageList'
import ParticipantList from './components/ParticipantList'
import AutoLoopPanel from './components/AutoLoopPanel'

export default function RoleChatPage() {
  const { message } = App.useApp()
  const currentBookId = useAppStore((s) => s.currentBookId)
  const roleChatMode = useAppStore((s) => s.roleChatMode)
  const roleChatAutoConfig = useAppStore((s) => s.roleChatAutoConfig)
  const setState = useAppStore((s) => s.setState)

  // 页面状态
  const [participants, setParticipants] = useState<RoleChatParticipant[]>([])
  const [messages, setMessages] = useState<RoleChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [isLooping, setIsLooping] = useState(false)
  const abortRef = useRef(false)

  // 切换模式
  const handleModeChange = (mode: RoleChatMode) => {
    setState({ roleChatMode: mode })
  }

  // 添加参与者
  const handleAddParticipant = (participant: RoleChatParticipant) => {
    setParticipants([...participants, participant])
    setAddModalOpen(false)
    message.success(`已添加参与者：${participant.name}`)
  }

  // 删除参与者
  const handleRemoveParticipant = (id: string) => {
    setParticipants(participants.filter((p) => p.id !== id))
    message.success('已移除参与者')
  }

  // 添加消息
  const addMessage = (participantId: string, participantName: string, content: string, isUser?: boolean) => {
    const msg: RoleChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      participantId,
      participantName,
      content,
      timestamp: Date.now(),
      isUser,
    }
    setMessages((prev) => [...prev, msg])
    return msg
  }

  // 手动发送消息
  const handleSendMessage = () => {
    const text = inputText.trim()
    if (!text) return

    addMessage('user', '用户', text, true)
    setInputText('')

    // 如果未在循环中，触发所有参与者的一轮响应
    if (!isLooping && participants.length > 0) {
      // TODO: 触发单次响应（阶段 B 实现）
      message.info('单次响应功能将在阶段 B 实现')
    }
  }

  // 重置会话
  const handleReset = () => {
    setMessages([])
    setParticipants([])
    message.success('已重置会话')
  }

  // 导出对话
  const handleExport = () => {
    if (messages.length === 0) {
      message.warning('暂无对话内容')
      return
    }

    const exportData = {
      mode: roleChatMode,
      participants: participants.map((p) => ({
        name: p.name,
        mode: p.mode,
        cardId: p.cardId,
        agentName: p.agentName,
      })),
      messages: messages.map((m) => ({
        participantName: m.participantName,
        content: m.content,
        timestamp: new Date(m.timestamp).toISOString(),
      })),
    }

    const json = JSON.stringify(exportData, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `角色交流_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    message.success('已导出对话记录')
  }

  // 启动/停止自动循环
  const handleToggleLoop = () => {
    if (isLooping) {
      abortRef.current = true
      setIsLooping(false)
      message.info('已停止自动循环')
    } else {
      if (participants.length === 0) {
        message.warning('请先添加参与者')
        return
      }
      setIsLooping(true)
      abortRef.current = false
      message.success('已启动自动循环')
      // TODO: 启动循环逻辑（阶段 C 实现）
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* 顶部控制栏 */}
      <Card size="small" style={{ marginBottom: 0 }}>
        <Space split={<Divider type="vertical" />} wrap>
          <Space>
            <Typography.Text type="secondary">模式</Typography.Text>
            <Segmented
              value={roleChatMode}
              onChange={handleModeChange}
              options={[
                { label: '本地节点', value: 'local' },
                { label: 'Opencode', value: 'opencode' },
              ]}
            />
          </Space>
          <Space>
            <Badge status={participants.length > 0 ? 'success' : 'default'} />
            <Typography.Text type="secondary">
              {participants.length} 个参与者 · {messages.length} 条消息
            </Typography.Text>
          </Space>
          <Space>
            <Button
              size="small"
              icon={<QuestionCircleOutlined />}
              onClick={() => message.info('帮助文档将在阶段 E 实现')}
            >
              帮助
            </Button>
          </Space>
        </Space>
      </Card>

      {/* 主内容区 */}
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
        {/* 左侧边栏 */}
        <Card
          title="参与者与控制"
          size="small"
          style={{ width: 280, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          bodyStyle={{ flex: 1, overflow: 'auto', padding: 12 }}
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {/* 参与者列表 */}
            <ParticipantList
              participants={participants}
              onRemove={handleRemoveParticipant}
              onStatusChange={(id, status) => {
                setParticipants(
                  participants.map((p) => (p.id === id ? { ...p, status } : p)),
                )
              }}
            />

            <Button
              block
              icon={<PlusOutlined />}
              onClick={() => {
                if (!currentBookId && roleChatMode === 'local') {
                  message.warning('本地模式需要先选择当前作品')
                  return
                }
                setAddModalOpen(true)
              }}
            >
              添加参与者
            </Button>

            <Divider style={{ margin: '8px 0' }} />

            {/* 自动循环控制面板 */}
            <AutoLoopPanel
              config={roleChatAutoConfig}
              onConfigChange={(config) => setState({ roleChatAutoConfig: config })}
            />

            <Divider style={{ margin: '8px 0' }} />

            {/* 操作按钮 */}
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Button
                block
                type={isLooping ? 'default' : 'primary'}
                danger={isLooping}
                icon={isLooping ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                onClick={handleToggleLoop}
                disabled={participants.length === 0}
              >
                {isLooping ? '停止循环' : '启动循环'}
              </Button>
              <Button block icon={<ReloadOutlined />} onClick={handleReset}>
                重置会话
              </Button>
              <Button block icon={<DownloadOutlined />} onClick={handleExport}>
                导出对话
              </Button>
            </Space>
          </Space>
        </Card>

        {/* 主对话区 */}
        <Card
          title="对话区"
          size="small"
          style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 12, minHeight: 0 }}
        >
          {/* 消息列表 */}
          <MessageList messages={messages} participants={participants} />

          {/* 输入框 */}
          <Space.Compact style={{ width: '100%', marginTop: 12 }}>
            <Input
              placeholder="输入消息..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onPressEnter={handleSendMessage}
              disabled={isLooping}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSendMessage}
              disabled={isLooping || !inputText.trim()}
            >
              发送
            </Button>
          </Space.Compact>
        </Card>
      </div>

      {/* 添加参与者弹窗 */}
      <AddParticipantModal
        open={addModalOpen}
        mode={roleChatMode}
        onClose={() => setAddModalOpen(false)}
        onAdd={handleAddParticipant}
      />
    </Space>
  )
}
