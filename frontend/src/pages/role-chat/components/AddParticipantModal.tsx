import { useState, useEffect } from 'react'
import { Modal, Space, Typography, List, Input, Select, Button, Avatar, App, Spin } from 'antd'
import { SearchOutlined, UserOutlined } from '@ant-design/icons'
import { useAppStore } from '../../../store/appStore'
import type { RoleChatMode, RoleChatParticipant, OpencodeAgent } from '../../../services/types'
import { listOpencodeAgents } from '../../../services/real/roleChat'

interface Props {
  open: boolean
  mode: RoleChatMode
  onClose: () => void
  onAdd: (participant: RoleChatParticipant) => void
}

// 生成头像颜色（从名称生成）
function colorFromName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colors = ['#f56a00', '#7265e6', '#ffbf00', '#00a2ae', '#eb2f96', '#52c41a', '#1890ff']
  return colors[Math.abs(hash) % colors.length]
}

export default function AddParticipantModal({ open, mode, onClose, onAdd }: Props) {
  const { message } = App.useApp()
  const currentBookId = useAppStore((s) => s.currentBookId)
  const cards = useAppStore((s) => s.cards)
  const providers = useAppStore((s) => s.providers)
  const roleChatOpencodeURL = useAppStore((s) => s.roleChatOpencodeURL)
  const setState = useAppStore((s) => s.setState)

  // 本地模式状态
  const [selectedCardId, setSelectedCardId] = useState<string>()
  const [selectedNodeId, setSelectedNodeId] = useState<string>()
  const [searchText, setSearchText] = useState('')

  // Opencode 模式状态
  const [opcodeURL, setOpcodeURL] = useState(roleChatOpencodeURL)
  const [opcodeAgents, setOpcodeAgents] = useState<OpencodeAgent[]>([])
  const [opcodeLoading, setOpcodeLoading] = useState(false)
  const [selectedAgentName, setSelectedAgentName] = useState<string>()
  const [selectedModel, setSelectedModel] = useState('opencode/default')

  // 当前作品的角色卡片
  const characterCards = cards.filter((c) => c.bookId === currentBookId && c.type === 'character')
  const filteredCards = searchText
    ? characterCards.filter((c) => c.name.toLowerCase().includes(searchText.toLowerCase()))
    : characterCards

  // 文本节点池
  const textNodes = providers.filter((p) => p.nodeType === 'text' && p.enabled)

  // 重置状态
  useEffect(() => {
    if (open) {
      setSelectedCardId(undefined)
      setSelectedNodeId(textNodes[0]?.id)
      setSearchText('')
      setSelectedAgentName(undefined)
    }
  }, [open, mode])

  // 加载 Opencode Agent 列表
  const loadOpencodeAgents = async () => {
    setOpcodeLoading(true)
    try {
      const agents = await listOpencodeAgents(opcodeURL)
      setOpcodeAgents(agents)
      if (agents.length > 0) {
        setSelectedAgentName(agents[0].name)
      }
      message.success(`已连接 Opencode Server，找到 ${agents.length} 个 Agent`)
    } catch (e) {
      message.error(e instanceof Error ? e.message : '连接失败')
      setOpcodeAgents([])
    } finally {
      setOpcodeLoading(false)
    }
  }

  // 确认添加
  const handleOk = () => {
    if (mode === 'local') {
      if (!selectedCardId || !selectedNodeId) {
        message.warning('请选择角色和节点')
        return
      }

      const card = cards.find((c) => c.id === selectedCardId)
      if (!card) return

      const participant: RoleChatParticipant = {
        id: `participant-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: card.name,
        mode: 'local',
        cardId: selectedCardId,
        nodeId: selectedNodeId,
        avatar: card.fields.avatar,
        color: colorFromName(card.name),
        status: 'idle',
      }

      onAdd(participant)
    } else {
      // Opencode 模式
      if (!selectedAgentName) {
        message.warning('请选择 Agent')
        return
      }

      const participant: RoleChatParticipant = {
        id: `participant-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: selectedAgentName,
        mode: 'opencode',
        agentName: selectedAgentName,
        model: selectedModel,
        color: colorFromName(selectedAgentName),
        status: 'idle',
      }

      onAdd(participant)
      // 保存 Opencode URL
      setState({ roleChatOpencodeURL: opcodeURL })
    }
  }

  return (
    <Modal
      title="添加参与者"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      width={600}
      okText="添加"
      cancelText="取消"
    >
      {mode === 'local' ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {/* 搜索框 */}
          <Input
            placeholder="搜索角色名称..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />

          {/* 角色列表 */}
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
              选择角色卡片（{filteredCards.length} 个）
            </Typography.Text>
            <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #d9d9d9', borderRadius: 4 }}>
              <List
                size="small"
                dataSource={filteredCards}
                locale={{ emptyText: '暂无角色卡片' }}
                renderItem={(card) => (
                  <List.Item
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      backgroundColor: selectedCardId === card.id ? '#e6f4ff' : undefined,
                    }}
                    onClick={() => setSelectedCardId(card.id)}
                  >
                    <List.Item.Meta
                      avatar={
                        card.fields.avatar ? (
                          <Avatar src={card.fields.avatar} />
                        ) : (
                          <Avatar style={{ backgroundColor: colorFromName(card.name) }}>
                            {card.name[0].toUpperCase()}
                          </Avatar>
                        )
                      }
                      title={card.name}
                      description={
                        <Typography.Text
                          type="secondary"
                          ellipsis
                          style={{ fontSize: 12, maxWidth: 400, display: 'block' }}
                        >
                          {card.description || '（无描述）'}
                        </Typography.Text>
                      }
                    />
                  </List.Item>
                )}
              />
            </div>
          </div>

          {/* 节点选择 */}
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
              选择节点
            </Typography.Text>
            <Select
              style={{ width: '100%' }}
              value={selectedNodeId}
              onChange={setSelectedNodeId}
              options={textNodes.map((n) => ({ label: n.name, value: n.id }))}
              placeholder="选择一个文本节点"
            />
          </div>
        </Space>
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {/* Opencode Server 地址 */}
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
              Opencode Server 地址
            </Typography.Text>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={opcodeURL}
                onChange={(e) => setOpcodeURL(e.target.value)}
                placeholder="http://127.0.0.1:4096"
              />
              <Button type="primary" onClick={loadOpencodeAgents} loading={opcodeLoading}>
                连接
              </Button>
            </Space.Compact>
          </div>

          {/* Agent 列表 */}
          {opcodeLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Spin />
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
                正在连接 Opencode Server...
              </Typography.Text>
            </div>
          ) : opcodeAgents.length > 0 ? (
            <>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
                  选择 Agent（{opcodeAgents.length} 个）
                </Typography.Text>
                <div style={{ maxHeight: 250, overflowY: 'auto', border: '1px solid #d9d9d9', borderRadius: 4 }}>
                  <List
                    size="small"
                    dataSource={opcodeAgents}
                    renderItem={(agent) => (
                      <List.Item
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          backgroundColor: selectedAgentName === agent.name ? '#e6f4ff' : undefined,
                        }}
                        onClick={() => setSelectedAgentName(agent.name)}
                      >
                        <List.Item.Meta
                          avatar={
                            <Avatar style={{ backgroundColor: colorFromName(agent.name) }} icon={<UserOutlined />} />
                          }
                          title={agent.name}
                          description={
                            agent.description ? (
                              <Typography.Text
                                type="secondary"
                                ellipsis
                                style={{ fontSize: 12, maxWidth: 450, display: 'block' }}
                              >
                                {agent.description}
                              </Typography.Text>
                            ) : null
                          }
                        />
                      </List.Item>
                    )}
                  />
                </div>
              </div>

              {/* Model 选择 */}
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
                  模型
                </Typography.Text>
                <Input
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  placeholder="opencode/default"
                />
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
              <UserOutlined style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }} />
              <div>点击「连接」按钮加载 Agent 列表</div>
            </div>
          )}
        </Space>
      )}
    </Modal>
  )
}
