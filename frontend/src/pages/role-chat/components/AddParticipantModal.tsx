import { useState, useEffect } from 'react'
import { Modal, Space, Typography, List, Input, Select, Avatar, App, Checkbox } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { useAppStore, genId } from '../../../store/appStore'
import type { RoleChatParticipant } from '../../../services/types'

interface Props {
  open: boolean
  onClose: () => void
  /** 批量添加参与者（一次可勾选多个角色卡，各自指定推理节点） */
  onAddMany: (participants: RoleChatParticipant[]) => void
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

export default function AddParticipantModal({ open, onClose, onAddMany }: Props) {
  const { message } = App.useApp()
  const currentBookId = useAppStore((s) => s.currentBookId)
  const cards = useAppStore((s) => s.cards)
  const providers = useAppStore((s) => s.providers)

  // 多选角色 + 每个角色独立节点
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([])
  const [cardNodeMap, setCardNodeMap] = useState<Record<string, string>>({})
  const [searchText, setSearchText] = useState('')

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 弹窗打开时一次性重置选择项
      setSelectedCardIds([])
      setCardNodeMap({})
      setSearchText('')
    }
  }, [open])

  // 切换角色勾选（首次勾选时给默认节点）
  const toggleCard = (cardId: string) => {
    setSelectedCardIds((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId],
    )
    setCardNodeMap((prev) => (prev[cardId] ? prev : { ...prev, [cardId]: textNodes[0]?.id ?? '' }))
  }

  // 为某角色设定节点（同时自动勾选该角色）
  const setCardNode = (cardId: string, nodeId: string) => {
    setCardNodeMap((prev) => ({ ...prev, [cardId]: nodeId }))
    setSelectedCardIds((prev) => (prev.includes(cardId) ? prev : [...prev, cardId]))
  }

  // 确认添加
  const handleOk = () => {
    if (selectedCardIds.length === 0) {
      message.warning('请至少勾选一个角色')
      return
    }
    const participants: RoleChatParticipant[] = []
    for (const cardId of selectedCardIds) {
      const card = cards.find((c) => c.id === cardId)
      if (!card) continue
      const nodeId = cardNodeMap[cardId] || textNodes[0]?.id
      if (!nodeId) {
        message.warning(`角色「${card.name}」未选择节点`)
        return
      }
      participants.push({
        id: genId('participant'),
        name: card.name,
        cardId,
        nodeId,
        avatar: card.fields.avatar,
        color: colorFromName(card.name),
        status: 'idle',
      })
    }
    if (participants.length === 0) return
    onAddMany(participants)
  }

  return (
    <Modal
      title="添加参与者"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      width={640}
      okText="添加"
      cancelText="取消"
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* 搜索框 */}
        <Input
          placeholder="搜索角色名称..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
        />

        {/* 角色列表（可多选，每行右侧指定节点） */}
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
            选择角色卡片（可多选，已选 {selectedCardIds.length} / {filteredCards.length} 个）
          </Typography.Text>
          <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #d9d9d9', borderRadius: 4 }}>
            <List
              size="small"
              dataSource={filteredCards}
              locale={{ emptyText: '暂无角色卡片' }}
              renderItem={(card) => {
                const checked = selectedCardIds.includes(card.id)
                return (
                  <List.Item
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      backgroundColor: checked ? '#e6f4ff' : undefined,
                    }}
                    onClick={() => toggleCard(card.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                      <Checkbox
                        checked={checked}
                        onChange={() => toggleCard(card.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {card.fields.avatar ? (
                        <Avatar src={card.fields.avatar} />
                      ) : (
                        <Avatar style={{ backgroundColor: colorFromName(card.name), flexShrink: 0 }}>
                          {card.name[0].toUpperCase()}
                        </Avatar>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Typography.Text strong style={{ fontSize: 13, display: 'block' }}>
                          {card.name}
                        </Typography.Text>
                        <Typography.Text
                          type="secondary"
                          ellipsis
                          style={{ fontSize: 12, display: 'block' }}
                        >
                          {card.description || '（无描述）'}
                        </Typography.Text>
                      </div>
                      <Select
                        size="small"
                        style={{ width: 160, flexShrink: 0 }}
                        value={cardNodeMap[card.id] || undefined}
                        onChange={(v) => setCardNode(card.id, v)}
                        onClick={(e) => e.stopPropagation()}
                        options={textNodes.map((n) => ({ label: n.name, value: n.id }))}
                        placeholder="选择节点"
                        getPopupContainer={(t) => t.parentElement || document.body}
                      />
                    </div>
                  </List.Item>
                )
              }}
            />
          </div>
          {textNodes.length === 0 && (
            <Typography.Text type="danger" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
              暂无可用文本节点，请先在「系统设置」启用文本节点
            </Typography.Text>
          )}
        </div>
      </Space>
    </Modal>
  )
}
