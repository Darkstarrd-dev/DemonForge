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
  Modal,
  Dropdown,
} from 'antd'
import {
  PlusOutlined,
  SendOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  DownloadOutlined,
  QuestionCircleOutlined,
  DownOutlined,
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
  const [helpModalOpen, setHelpModalOpen] = useState(false)
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
    opcodeSessionsRef.current.clear()
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
    message.success('已导出对话记录（JSON）')
  }

  // 导出对话为 TXT
  const handleExportTxt = () => {
    if (messages.length === 0) {
      message.warning('暂无对话内容')
      return
    }

    const txtContent = messages
      .map((m) => {
        const time = new Date(m.timestamp).toLocaleString('zh-CN')
        return `[${time}] ${m.participantName}:\n${m.content}\n`
      })
      .join('\n')

    const header = `角色交流记录\n模式: ${roleChatMode === 'local' ? '本地节点' : 'Opencode'}\n参与者: ${participants.map((p) => p.name).join(', ')}\n导出时间: ${new Date().toLocaleString('zh-CN')}\n${'='.repeat(60)}\n\n`

    const blob = new Blob([header + txtContent], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `角色交流_${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
    message.success('已导出对话记录（TXT）')
  }

  // 随机延迟（毫秒）
  const randomDelay = (min: number, max: number) => {
    return Math.random() * (max - min) + min
  }

  // 单个 Agent 的循环逻辑
  const runAgentLoop = async (participant: RoleChatParticipant) => {
    const config = roleChatAutoConfig
    let replyCount = 0
    const startTime = Date.now()

    // 计算目标次数（如果是 count 模式，加上波动）
    let targetCount = config.count
    if (config.mode === 'count') {
      const variance = Math.floor(Math.random() * (2 * config.variance + 1)) - config.variance
      targetCount = Math.max(1, config.count + variance)
    }

    while (!abortRef.current) {
      // 检查终止条件
      if (config.mode === 'count') {
        if (replyCount >= targetCount) break
      } else {
        if (Date.now() - startTime >= config.duration * 1000) break
      }

      // 反应延迟（思考延迟）
      updateParticipantStatus(participant.id, 'thinking')
      await new Promise((resolve) =>
        setTimeout(resolve, randomDelay(config.reactionDelayMin * 1000, config.reactionDelayMax * 1000)),
      )

      if (abortRef.current) break

      // 执行响应
      try {
        if (participant.mode === 'local') {
          await respondLocal(participant)
        } else {
          await respondOpencode(participant)
        }
        replyCount++

        if (abortRef.current) break

        // 冷却延迟
        if (config.cooldownBase > 0 || config.cooldownVariance > 0) {
          updateParticipantStatus(participant.id, 'waiting')
          const cooldown = randomDelay(
            (config.cooldownBase - config.cooldownVariance) * 1000,
            (config.cooldownBase + config.cooldownVariance) * 1000,
          )
          await new Promise((resolve) => setTimeout(resolve, Math.max(0, cooldown)))
        }
      } catch (e) {
        // 错误已在 respondLocal/respondOpencode 中处理
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    // 循环结束，标记为完成
    updateParticipantStatus(participant.id, 'done')
  }

  // 启动/停止自动循环
  const handleToggleLoop = async () => {
    if (isLooping) {
      abortRef.current = true
      setIsLooping(false)
      message.info('已停止自动循环')
    } else {
      if (participants.length === 0) {
        message.warning('请先添加参与者')
        return
      }

      // 过滤出非用户的参与者
      const agents = participants.filter((p) => p.id !== 'user')
      if (agents.length === 0) {
        message.warning('没有可用的 Agent 参与者')
        return
      }

      setIsLooping(true)
      abortRef.current = false

      const modeText = roleChatAutoConfig.mode === 'count'
        ? `每个 Agent 约 ${roleChatAutoConfig.count}±${roleChatAutoConfig.variance} 次回复`
        : `运行 ${roleChatAutoConfig.duration} 秒`
      message.success(`已启动自动循环（${modeText}）`)

      // 并发执行所有 Agent 的循环
      try {
        await Promise.all(agents.map((agent) => runAgentLoop(agent)))

        if (abortRef.current) {
          message.info('自动循环已停止')
        } else {
          message.success('自动循环已完成')
        }
      } finally {
        setIsLooping(false)
        // 重置所有 Agent 状态为 idle
        setParticipants((prev) => prev.map((p) => ({ ...p, status: 'idle' })))
      }
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
              onClick={() => setHelpModalOpen(true)}
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
              <Dropdown
                menu={{
                  items: [
                    { key: 'json', label: '导出为 JSON', onClick: handleExport },
                    { key: 'txt', label: '导出为 TXT', onClick: handleExportTxt },
                  ],
                }}
                disabled={messages.length === 0}
              >
                <Button block icon={<DownloadOutlined />}>
                  导出对话 <DownOutlined />
                </Button>
              </Dropdown>
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

      {/* 帮助文档弹窗 */}
      <Modal
        title="角色交流使用说明"
        open={helpModalOpen}
        onCancel={() => setHelpModalOpen(false)}
        footer={
          <Button type="primary" onClick={() => setHelpModalOpen(false)}>
            知道了
          </Button>
        }
        width={700}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Typography.Title level={5}>功能简介</Typography.Title>
            <Typography.Paragraph>
              角色交流模块支持多个角色进行对话交流，验证角色设定的一致性和可信度。支持两种模式：
            </Typography.Paragraph>
            <ul>
              <li>
                <strong>本地节点模式</strong>：使用本项目的节点池和角色卡，适合快速测试角色设定
              </li>
              <li>
                <strong>Opencode 模式</strong>：连接 Opencode Server，使用其 Agent 系统
              </li>
            </ul>
          </div>

          <div>
            <Typography.Title level={5}>使用流程</Typography.Title>
            <ol>
              <li>
                <strong>选择模式</strong>：顶部切换「本地节点」或「Opencode」
              </li>
              <li>
                <strong>添加参与者</strong>：
                <ul>
                  <li>本地模式：选择角色卡和节点</li>
                  <li>Opencode 模式：输入 Server 地址并连接，选择 Agent</li>
                </ul>
              </li>
              <li>
                <strong>手动对话</strong>：输入框发送消息，所有参与者依次响应
              </li>
              <li>
                <strong>自动循环</strong>：
                <ul>
                  <li>配置循环参数（次数/时间、冷却延迟、反应延迟）</li>
                  <li>点击「启动循环」，参与者自动进行多轮对话</li>
                  <li>点击「停止循环」随时中断</li>
                </ul>
              </li>
              <li>
                <strong>导出对话</strong>：支持 JSON（结构化）和 TXT（纯文本）格式
              </li>
            </ol>
          </div>

          <div>
            <Typography.Title level={5}>循环参数说明</Typography.Title>
            <ul>
              <li>
                <strong>循环模式</strong>：
                <ul>
                  <li>按次数：每个 Agent 回复目标次数（±波动范围）</li>
                  <li>按时间：运行指定秒数后停止</li>
                </ul>
              </li>
              <li>
                <strong>冷却时间</strong>：每次回复后的休息时间（基准值 ± 波动）
              </li>
              <li>
                <strong>反应延迟</strong>：每次响应前的"思考"时间范围
              </li>
            </ul>
          </div>

          <div>
            <Typography.Title level={5}>状态说明</Typography.Title>
            <ul>
              <li>
                <Badge status="default" /> <strong>空闲</strong>：等待触发
              </li>
              <li>
                <Badge status="processing" /> <strong>思考中</strong>：反应延迟阶段
              </li>
              <li>
                <Badge status="processing" /> <strong>回复中</strong>：正在生成响应
              </li>
              <li>
                <Badge status="processing" /> <strong>等待中</strong>：冷却延迟阶段
              </li>
              <li>
                <Badge status="success" /> <strong>完成</strong>：循环结束
              </li>
            </ul>
          </div>

          <div>
            <Typography.Title level={5}>注意事项</Typography.Title>
            <ul>
              <li>本地模式需要先在「书库概览」选择当前作品</li>
              <li>自动循环期间无法手动发送消息</li>
              <li>重置会话会清空所有消息和参与者</li>
              <li>Opencode 模式需要先启动 Opencode Server</li>
            </ul>
          </div>
        </Space>
      </Modal>
    </Space>
  )
}
