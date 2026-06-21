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
import { sendLocalRoleMessage, sendOpencodeMessage, createOpencodeSession } from '../../services/real/roleChat'
import AddParticipantModal from './components/AddParticipantModal'
import MessageList from './components/MessageList'
import ParticipantList from './components/ParticipantList'
import AutoLoopPanel from './components/AutoLoopPanel'

export default function RoleChatPage() {
  const { message } = App.useApp()
  const currentBookId = useAppStore((s) => s.currentBookId)
  const roleChatMode = useAppStore((s) => s.roleChatMode)
  const roleChatAutoConfig = useAppStore((s) => s.roleChatAutoConfig)
  const roleChatOpencodeURL = useAppStore((s) => s.roleChatOpencodeURL)
  const setState = useAppStore((s) => s.setState)

  // 页面状态
  const [participants, setParticipants] = useState<RoleChatParticipant[]>([])
  const [messages, setMessages] = useState<RoleChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [isLooping, setIsLooping] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const abortRef = useRef(false)
  // Opencode 会话缓存：Map<agentName, sessionID>
  const opcodeSessionsRef = useRef<Map<string, string>>(new Map())

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

  // 更新参与者状态
  const updateParticipantStatus = (id: string, status: RoleChatParticipant['status']) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)))
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

  // 单个参与者响应（本地模式）
  const respondLocal = async (participant: RoleChatParticipant) => {
    if (!participant.cardId || !participant.nodeId) return

    updateParticipantStatus(participant.id, 'thinking')

    // 模拟思考延迟
    await new Promise((resolve) => setTimeout(resolve, 500))

    updateParticipantStatus(participant.id, 'responding')

    // 创建临时消息用于流式更新
    const tempMsgId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    let accumulatedContent = ''

    try {
      const fullText = await sendLocalRoleMessage(
        participant.cardId,
        participant.nodeId,
        messages,
        (delta) => {
          accumulatedContent += delta
          // 实时更新消息内容
          setMessages((prev) => {
            const existingIndex = prev.findIndex((m) => m.id === tempMsgId)
            const tempMsg: RoleChatMessage = {
              id: tempMsgId,
              participantId: participant.id,
              participantName: participant.name,
              content: accumulatedContent,
              timestamp: Date.now(),
            }
            if (existingIndex >= 0) {
              const updated = [...prev]
              updated[existingIndex] = tempMsg
              return updated
            } else {
              return [...prev, tempMsg]
            }
          })
        },
      )

      // 替换临时消息为最终消息
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== tempMsgId)
        return [
          ...filtered,
          {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            participantId: participant.id,
            participantName: participant.name,
            content: fullText,
            timestamp: Date.now(),
          },
        ]
      })

      updateParticipantStatus(participant.id, 'idle')
    } catch (e) {
      // 移除临时消息
      setMessages((prev) => prev.filter((m) => m.id !== tempMsgId))
      message.error(`${participant.name} 响应失败: ${e instanceof Error ? e.message : String(e)}`)
      updateParticipantStatus(participant.id, 'idle')
    }
  }

  // 单个参与者响应（Opencode 模式）
  const respondOpencode = async (participant: RoleChatParticipant) => {
    if (!participant.agentName) return

    updateParticipantStatus(participant.id, 'thinking')

    // 模拟思考延迟
    await new Promise((resolve) => setTimeout(resolve, 500))

    try {
      // 获取或创建会话
      let sessionID = opcodeSessionsRef.current.get(participant.agentName)
      if (!sessionID) {
        updateParticipantStatus(participant.id, 'responding')
        const session = await createOpencodeSession(roleChatOpencodeURL, participant.agentName)
        sessionID = session.sessionID
        opcodeSessionsRef.current.set(participant.agentName, sessionID)
      }

      updateParticipantStatus(participant.id, 'responding')

      // 构建 Prompt（包含对话历史）
      const historyText = messages
        .map((m) => `[${m.participantName}]: ${m.content}`)
        .join('\n\n')
      const prompt = `${historyText}\n\n请回复最后一条消息，保持角色设定。`

      const response = await sendOpencodeMessage(
        roleChatOpencodeURL,
        sessionID,
        participant.agentName,
        participant.model || 'opencode/default',
        prompt,
      )

      addMessage(participant.id, participant.name, response)
      updateParticipantStatus(participant.id, 'idle')
    } catch (e) {
      message.error(`${participant.name} 响应失败: ${e instanceof Error ? e.message : String(e)}`)
      updateParticipantStatus(participant.id, 'idle')
    }
  }

  // 手动发送消息
  const handleSendMessage = async () => {
    const text = inputText.trim()
    if (!text || isSending) return

    addMessage('user', '用户', text, true)
    setInputText('')

    // 如果未在循环中，触发所有参与者的一轮响应
    if (!isLooping && participants.length > 0) {
      setIsSending(true)
      try {
        for (const participant of participants) {
          if (participant.mode === 'local') {
            await respondLocal(participant)
          } else {
            await respondOpencode(participant)
          }
        }
      } finally {
        setIsSending(false)
      }
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
              disabled={isLooping || isSending}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSendMessage}
              disabled={isLooping || isSending || !inputText.trim()}
              loading={isSending}
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
