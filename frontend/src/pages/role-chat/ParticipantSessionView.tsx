// 角色交流 · 参与者 session 视角。
// 版面（适配现有设计语言，复用 node-test 模块）：
//   顶端 = 该参与者的设定（角色名/节点切换/场景与 system 提示词预览，可折叠）
//   左侧 = 该参与者独立 Debug Info（DebugInfoPanel，可折叠）
//   右侧 = 当前对话情况（群聊 transcript + 本参与者在途流式预览）
//   下方 = 推理过程（复刻 node-test ChatBubble：推理中流式卡片 / 完成后折叠「思考过程」）
import { useState } from 'react'
import { App, Avatar, Button, Collapse, Space, Splitter, Tag, Typography, theme } from 'antd'
import { BulbOutlined, BugOutlined, CopyOutlined, SettingOutlined } from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'
import { NodePickerButton } from '../../components/node-picker/NodePickerButton'
import DebugInfoPanel from '../node-test/DebugInfoPanel'
import MessageList from './components/MessageList'
import { buildRoleSystemPrompt } from '../../services/roleChatEngine'

export default function ParticipantSessionView() {
  const { token } = theme.useToken()
  const { message } = App.useApp()
  const activeSessionId = useAppStore((s) => s.roleChatActiveSessionId)
  const participants = useAppStore((s) => s.roleChatParticipants)
  const messages = useAppStore((s) => s.roleChatMessages)
  const sceneSetting = useAppStore((s) => s.roleChatSceneSetting)
  const cards = useAppStore((s) => s.cards)
  const runtimes = useAppStore((s) => s.roleChatRuntimes)

  const [showDebug, setShowDebug] = useState(true)
  const [settingOpen, setSettingOpen] = useState<string[]>([])

  const participant = participants.find((p) => p.id === activeSessionId)

  // 参与者已被移除（在别处删除）→ 回退主界面
  if (!participant) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography.Text type="secondary">该参与者已不存在，请在左侧选择其它 session</Typography.Text>
      </div>
    )
  }

  const card = cards.find((c) => c.id === participant.cardId)
  const runtime = runtimes[participant.id]
  const systemPrompt = card ? buildRoleSystemPrompt(card, sceneSetting) : '（未找到角色卡）'

  const copyText = (text: string) =>
    navigator.clipboard.writeText(text).then(() => message.success('已复制')).catch(() => message.error('复制失败'))

  const setNode = (nodeId: string) =>
    useAppStore.setState((s) => ({
      roleChatParticipants: s.roleChatParticipants.map((p) => (p.id === participant.id ? { ...p, nodeId } : p)),
    }))

  const isStreaming = runtime?.status === 'streaming' || runtime?.status === 'thinking'
  const reasoning = runtime?.streamingReasoning ?? ''

  // ===== 顶部：设定 =====
  const header = (
    <div style={{ flexShrink: 0, borderBottom: `1px solid ${token.colorBorder}`, padding: '8px 16px', background: token.colorBgContainer }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {participant.avatar ? (
          <Avatar size={28} src={participant.avatar} />
        ) : (
          <Avatar size={28} style={{ backgroundColor: participant.color }}>{participant.name[0]?.toUpperCase()}</Avatar>
        )}
        <Typography.Text strong style={{ fontSize: 15 }}>{participant.name}</Typography.Text>
        {runtime?.status === 'streaming' && <Tag color="blue">推理中</Tag>}
        {runtime?.status === 'done' && <Tag color="green">完成</Tag>}
        {runtime?.status === 'error' && <Tag color="red">失败</Tag>}
        <div style={{ flex: 1 }} />
        {/* 推理节点选择按钮（归一化：下拉→按钮） */}
        <Space size={6}>
          <NodePickerButton
            moduleKey="roleChat"
            kind="text"
            value={participant.nodeId || undefined}
            onChange={setNode}
            style={{ width: 180 }}
          />
          <Button
            size="small"
            type={showDebug ? 'primary' : 'default'}
            icon={<BugOutlined />}
            onClick={() => setShowDebug((v) => !v)}
          >
            Debug
          </Button>
        </Space>
      </div>
      <Collapse
        ghost
        size="small"
        activeKey={settingOpen}
        onChange={(k) => setSettingOpen(k as string[])}
        style={{ marginTop: 4 }}
        items={[{
          key: 'setting',
          label: (
            <Space size={4}>
              <SettingOutlined style={{ fontSize: 12, color: token.colorTextSecondary }} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>角色设定 / 场景 / System 提示词</Typography.Text>
            </Space>
          ),
          children: (
            <div>
              {sceneSetting.trim() && (
                <>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>【当前场景】</Typography.Text>
                  <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 13, marginBottom: 8 }}>
                    {sceneSetting.trim()}
                  </Typography.Paragraph>
                </>
              )}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                【System 提示词（缓存固定前缀）】
                <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyText(systemPrompt)} style={{ marginLeft: 4 }} />
              </Typography.Text>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: token.colorTextTertiary, background: token.colorFillQuaternary, borderRadius: 6, padding: 8, margin: '4px 0 0', maxHeight: 180, overflow: 'auto' }}>
                {systemPrompt}
              </pre>
            </div>
          ),
        }]}
      />
    </div>
  )

  // ===== 右侧：对话情况 =====
  const conversation = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, padding: 12 }}>
      <MessageList messages={messages} participants={participants} />
      {isStreaming && runtime?.streamingText && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: token.colorFillQuaternary, border: `1px solid ${token.colorBorder}` }}>
          <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
            {participant.name} 正在输入…
          </Typography.Text>
          <Typography.Text style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{runtime.streamingText}</Typography.Text>
        </div>
      )}
    </div>
  )

  // ===== 下方：推理过程（复刻 node-test ChatBubble reasoning） =====
  const reasoningPanel = (
    <div className="hide-scrollbar" style={{ height: '100%', overflow: 'auto', padding: 12 }}>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>推理过程</Typography.Text>
      {!reasoning ? (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>暂无推理过程（该参与者发言后展示）</Typography.Text>
      ) : isStreaming ? (
        // 推理中流式显示
        <div style={{ background: token.colorFillQuaternary, borderRadius: 8, padding: '8px 12px' }}>
          <Space size={4} style={{ marginBottom: 6 }}>
            <BulbOutlined style={{ fontSize: 12, color: token.colorPrimary }} />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>推理中...</Typography.Text>
          </Space>
          <Typography.Text style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: token.colorTextTertiary, display: 'block' }}>
            {reasoning}
          </Typography.Text>
        </div>
      ) : (
        // 完成后折叠显示
        <Collapse
          ghost
          size="small"
          defaultActiveKey={['reasoning']}
          items={[{
            key: 'reasoning',
            label: (
              <Space size={4}>
                <BulbOutlined style={{ fontSize: 12, color: token.colorTextSecondary }} />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>思考过程</Typography.Text>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  title="复制思考过程"
                  onClick={(e) => { e.stopPropagation(); copyText(reasoning) }}
                  style={{ fontSize: 12, height: 20, padding: '0 4px', marginLeft: 4 }}
                />
              </Space>
            ),
            children: (
              <Typography.Text style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: token.colorTextTertiary, display: 'block' }}>
                {reasoning}
              </Typography.Text>
            ),
          }]}
          style={{ background: token.colorFillQuaternary, borderRadius: 8, padding: '4px 8px' }}
        />
      )}
    </div>
  )

  // 右侧纵向 Splitter：上 conversation / 下 reasoning
  const rightArea = (
    <Splitter layout="vertical">
      <Splitter.Panel min="30%">{conversation}</Splitter.Panel>
      <Splitter.Panel defaultSize="32%" min="15%" max="70%" collapsible>{reasoningPanel}</Splitter.Panel>
    </Splitter>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: token.colorBgContainer }}>
      {header}
      <div style={{ flex: 1, minHeight: 0 }}>
        {showDebug ? (
          <Splitter>
            <Splitter.Panel defaultSize={340} min={200} max={560} collapsible>
              <DebugInfoPanel data={runtime?.debug ?? { previewBody: null, actualBody: null, sseChunks: [] }} onClose={() => setShowDebug(false)} />
            </Splitter.Panel>
            <Splitter.Panel>{rightArea}</Splitter.Panel>
          </Splitter>
        ) : (
          rightArea
        )}
      </div>
    </div>
  )
}
