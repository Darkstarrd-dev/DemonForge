import { useState, useRef } from 'react'
import {
  App,
  Button,
  Input,
  Space,
  Typography,
  Badge,
  Modal,
  Dropdown,
  Popover,
  theme,
} from 'antd'
import {
  SendOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  DownloadOutlined,
  QuestionCircleOutlined,
  DownOutlined,
  EnvironmentOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useAppStore, genId } from '../../store/appStore'
import type { RoleChatParticipant, RoleChatMessage } from '../../services/types'
import { respondParticipant, cancelParticipant } from '../../services/roleChatEngine'
import SceneSettingModal from './components/SceneSettingModal'
import MessageList from './components/MessageList'
import AutoLoopPanel from './components/AutoLoopPanel'
import ParticipantSessionView from './ParticipantSessionView'

export default function RoleChatPage() {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const activeSessionId = useAppStore((s) => s.roleChatActiveSessionId)
  const participants = useAppStore((s) => s.roleChatParticipants)
  const messages = useAppStore((s) => s.roleChatMessages)
  const sceneSetting = useAppStore((s) => s.roleChatSceneSetting)
  const roleChatAutoConfig = useAppStore((s) => s.roleChatAutoConfig)
  const setState = useAppStore((s) => s.setState)

  const [inputText, setInputText] = useState('')
  const [isLooping, setIsLooping] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [helpModalOpen, setHelpModalOpen] = useState(false)
  const [sceneModalOpen, setSceneModalOpen] = useState(false)
  const [loopPopoverOpen, setLoopPopoverOpen] = useState(false)
  const abortRef = useRef(false)

  // 更新参与者循环 UI 状态（写 store，函数式避免并发覆盖）
  const updateParticipantStatus = (id: string, status: RoleChatParticipant['status']) =>
    useAppStore.setState((s) => ({
      roleChatParticipants: s.roleChatParticipants.map((p) => (p.id === id ? { ...p, status } : p)),
    }))

  // 手动发送：把用户消息追加到群聊流，触发所有参与者依次响应
  const handleSendMessage = async () => {
    const text = inputText.trim()
    if (!text || isSending) return
    const userMsg: RoleChatMessage = {
      id: genId('rcmsg'),
      participantId: 'user',
      participantName: '用户',
      content: text,
      timestamp: Date.now(),
      isUser: true,
    }
    useAppStore.setState((s) => ({ roleChatMessages: [...s.roleChatMessages, userMsg] }))
    setInputText('')

    if (!isLooping && participants.length > 0) {
      setIsSending(true)
      try {
        for (const p of participants) {
          updateParticipantStatus(p.id, 'responding')
          await respondParticipant(p)
          updateParticipantStatus(p.id, 'idle')
        }
      } finally {
        setIsSending(false)
      }
    }
  }

  // 重置会话
  const handleReset = () => {
    setState({
      roleChatMessages: [],
      roleChatParticipants: [],
      roleChatSceneSetting: '',
      roleChatActiveSessionId: 'main',
      roleChatRuntimes: {},
    })
    message.success('已重置会话')
  }

  // 导出
  const downloadFile = (content: string, ext: string, mime: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `角色交流_${new Date().toISOString().slice(0, 10)}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }
  const handleExport = () => {
    if (messages.length === 0) { message.warning('暂无对话内容'); return }
    const exportData = {
      participants: participants.map((p) => ({ name: p.name, cardId: p.cardId })),
      messages: messages.map((m) => ({ participantName: m.participantName, content: m.content, timestamp: new Date(m.timestamp).toISOString() })),
    }
    downloadFile(JSON.stringify(exportData, null, 2), 'json', 'application/json')
    message.success('已导出对话记录（JSON）')
  }
  const handleExportTxt = () => {
    if (messages.length === 0) { message.warning('暂无对话内容'); return }
    const body = messages.map((m) => `[${new Date(m.timestamp).toLocaleString('zh-CN')}] ${m.participantName}:\n${m.content}\n`).join('\n')
    const header = `角色交流记录\n参与者: ${participants.map((p) => p.name).join(', ')}\n导出时间: ${new Date().toLocaleString('zh-CN')}\n${'='.repeat(60)}\n\n`
    downloadFile(header + body, 'txt', 'text/plain;charset=utf-8')
    message.success('已导出对话记录（TXT）')
  }

  // 自动循环
  const randomDelay = (min: number, max: number) => Math.random() * (max - min) + min
  const runAgentLoop = async (participant: RoleChatParticipant) => {
    const config = roleChatAutoConfig
    let replyCount = 0
    const startTime = Date.now()
    let targetCount = config.count
    if (config.mode === 'count') {
      const variance = Math.floor(Math.random() * (2 * config.variance + 1)) - config.variance
      targetCount = Math.max(1, config.count + variance)
    }
    while (!abortRef.current) {
      if (config.mode === 'count') { if (replyCount >= targetCount) break }
      else if (Date.now() - startTime >= config.duration * 1000) break

      updateParticipantStatus(participant.id, 'thinking')
      await new Promise((r) => setTimeout(r, randomDelay(config.reactionDelayMin * 1000, config.reactionDelayMax * 1000)))
      if (abortRef.current) break

      try {
        await respondParticipant(participant)
        replyCount++
        if (abortRef.current) break
        if (config.cooldownBase > 0 || config.cooldownVariance > 0) {
          updateParticipantStatus(participant.id, 'waiting')
          const cooldown = randomDelay((config.cooldownBase - config.cooldownVariance) * 1000, (config.cooldownBase + config.cooldownVariance) * 1000)
          await new Promise((r) => setTimeout(r, Math.max(0, cooldown)))
        }
      } catch {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
    updateParticipantStatus(participant.id, 'done')
  }

  const handleToggleLoop = async () => {
    if (isLooping) {
      abortRef.current = true
      participants.forEach((p) => cancelParticipant(p.id))
      setIsLooping(false)
      message.info('已停止自动循环')
      return
    }
    if (participants.length === 0) { message.warning('请先添加参与者'); return }
    setIsLooping(true)
    abortRef.current = false
    const modeText = roleChatAutoConfig.mode === 'count'
      ? `每个角色约 ${roleChatAutoConfig.count}±${roleChatAutoConfig.variance} 次回复`
      : `运行 ${roleChatAutoConfig.duration} 秒`
    message.success(`已启动自动循环（${modeText}）`)
    const agents = [...participants]
    try {
      await Promise.all(agents.map((a) => runAgentLoop(a)))
      message.success(abortRef.current ? '自动循环已停止' : '自动循环已完成')
    } finally {
      setIsLooping(false)
      useAppStore.setState((s) => ({ roleChatParticipants: s.roleChatParticipants.map((p) => ({ ...p, status: 'idle' as const })) }))
    }
  }

  // 非主界面 → 参与者 session 视角
  if (activeSessionId !== 'main') {
    return <ParticipantSessionView />
  }

  // 主界面 → 群聊
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: token.colorBgContainer }}>
      {/* 顶部控制栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '8px 16px', borderBottom: `1px solid ${token.colorBorder}`, flexShrink: 0 }}>
        <Space>
          <Badge status={participants.length > 0 ? 'success' : 'default'} />
          <Typography.Text type="secondary">{participants.length} 个参与者 · {messages.length} 条消息</Typography.Text>
        </Space>
        <div style={{ flex: 1 }} />
        <Badge dot={!!sceneSetting.trim()}>
          <Button size="small" icon={<EnvironmentOutlined />} onClick={() => setSceneModalOpen(true)}>场景设定</Button>
        </Badge>
        <Popover
          open={loopPopoverOpen}
          onOpenChange={setLoopPopoverOpen}
          trigger="click"
          placement="bottomRight"
          content={<div style={{ width: 280 }}><AutoLoopPanel config={roleChatAutoConfig} onConfigChange={(c) => setState({ roleChatAutoConfig: c })} /></div>}
        >
          <Button size="small" icon={<SettingOutlined />}>循环设置</Button>
        </Popover>
        <Button
          size="small"
          type={isLooping ? 'default' : 'primary'}
          danger={isLooping}
          icon={isLooping ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
          onClick={handleToggleLoop}
          disabled={participants.length === 0}
        >
          {isLooping ? '停止循环' : '启动循环'}
        </Button>
        <Dropdown
          menu={{ items: [
            { key: 'json', label: '导出为 JSON', onClick: handleExport },
            { key: 'txt', label: '导出为 TXT', onClick: handleExportTxt },
          ] }}
          disabled={messages.length === 0}
        >
          <Button size="small" icon={<DownloadOutlined />}>导出 <DownOutlined /></Button>
        </Dropdown>
        <Button size="small" icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
        <Button size="small" icon={<QuestionCircleOutlined />} onClick={() => setHelpModalOpen(true)}>帮助</Button>
      </div>

      {/* 主对话区 */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 12, maxWidth: 1000, width: '100%', margin: '0 auto' }}>
        <MessageList messages={messages} participants={participants} />
        <Space.Compact style={{ width: '100%', marginTop: 12 }}>
          <Input
            placeholder={participants.length === 0 ? '请先在左侧「添加参与者」' : '输入消息…'}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onPressEnter={handleSendMessage}
            disabled={isLooping || isSending || participants.length === 0}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSendMessage}
            disabled={isLooping || isSending || !inputText.trim() || participants.length === 0}
            loading={isSending}
          >
            发送
          </Button>
        </Space.Compact>
      </div>

      <SceneSettingModal
        open={sceneModalOpen}
        value={sceneSetting}
        participantNames={participants.map((p) => p.name)}
        onClose={() => setSceneModalOpen(false)}
        onSave={(text) => setState({ roleChatSceneSetting: text })}
      />

      <Modal
        title="角色交流使用说明"
        open={helpModalOpen}
        onCancel={() => setHelpModalOpen(false)}
        footer={<Button type="primary" onClick={() => setHelpModalOpen(false)}>知道了</Button>}
        width={680}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Typography.Title level={5}>功能简介</Typography.Title>
            <Typography.Paragraph>
              多个角色基于各自设定进行群聊，验证角色一致性。左侧 session 列表可在「主界面」与各参与者视角间切换——参与者视角实时展示其收发消息、推理过程与 Debug Info。
            </Typography.Paragraph>
          </div>
          <div>
            <Typography.Title level={5}>使用流程</Typography.Title>
            <ol>
              <li><strong>选择作品</strong>：先在「书库概览」选择当前作品</li>
              <li><strong>添加参与者</strong>：左侧「添加参与者」选择角色卡 + 推理节点</li>
              <li><strong>设定场景</strong>（可选）：注入所有角色的共享背景</li>
              <li><strong>手动对话</strong>：输入消息，所有参与者依次响应</li>
              <li><strong>自动循环</strong>：「循环设置」配参数后「启动循环」</li>
              <li><strong>查看 / 导出</strong>：切到参与者 session 看其推理与 Debug；支持 JSON/TXT 导出</li>
            </ol>
          </div>
          <div>
            <Typography.Title level={5}>独立缓存</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
              每个参与者维护各自的对话前缀（system 固定 + 群聊历史 append-only），同一节点被多个角色复用时各自命中 prompt 缓存、互不串扰，降低费用。
            </Typography.Paragraph>
          </div>
        </Space>
      </Modal>
    </div>
  )
}
