// 节点测试 · 右侧设置面板（A-8 从 index.tsx 抽出）。
// 三视图分支：sysPrompt（System Instructions 编辑）/ debug（Debug Info）/ params（参数设置）。
// SystemPromptEditor 的 key 重挂载依赖 activeId，故 key 由父级在传入时指定（此处不持有该逻辑）。
// 对比模式下 debug 视图带左右切换；params 视图顶部 header（对比/新对话/sysPrompt/debug 入口）+ ParamsPanel + 对话记录入口。
import { Button, Space, Tooltip, Segmented, theme } from 'antd'
import { ColumnWidthOutlined, PlusOutlined, ProfileOutlined, BugOutlined, HistoryOutlined } from '@ant-design/icons'
import type { ReactNode } from 'react'
import type { NodeTestForm } from '../../store/appStore'
import type { DebugInfoData } from '../../services/types'
import SystemPromptEditor from './SystemPromptEditor'
import DebugInfoPanel from './DebugInfoPanel'
import ParamsPanel from './panels/ParamsPanel'
import type { SystemPromptPreset } from '../../store/appStore'

export default function NodeTestSidebar(props: {
  sidebarView: 'params' | 'sysPrompt' | 'debug'
  setSidebarView: (v: 'params' | 'sysPrompt' | 'debug') => void
  // System Prompt
  systemPromptPresets: SystemPromptPreset[]
  systemPromptActiveId: string | null
  activeSystemPromptTitle: string
  activeSystemPromptContent: string
  onSavePreset: (title: string, content: string) => void
  onDeletePreset: (id: string) => void
  onSelectPreset: (id: string | null) => void
  // Debug
  compareMode: boolean
  debugSide: 'left' | 'right'
  setDebugSide: (v: 'left' | 'right') => void
  debugInfo: DebugInfoData
  debugInfoLeft: DebugInfoData
  debugInfoRight: DebugInfoData
  // header 操作
  onToggleCompare: () => void
  onNewConversation: () => void
  // ParamsPanel
  isImageMode: boolean
  isModelScope: boolean
  isGpt: boolean
  isXai: boolean
  gptSizeIsCustom: boolean
  supportsEdit: boolean
  isMultimodal: boolean
  busy: boolean
  nodeTestForm: NodeTestForm
  setForm: (patch: Partial<NodeTestForm>) => void
  clearConversation: () => void
  // 对话记录入口
  mainView: 'chat' | 'history'
  setMainView: (v: 'chat' | 'history') => void
  sessionCount: number
}) {
  const { token } = theme.useToken()
  const {
    sidebarView, setSidebarView,
    systemPromptPresets, systemPromptActiveId, activeSystemPromptTitle, activeSystemPromptContent,
    onSavePreset, onDeletePreset, onSelectPreset,
    compareMode, debugSide, setDebugSide, debugInfo, debugInfoLeft, debugInfoRight,
    onToggleCompare, onNewConversation,
    isImageMode, isModelScope, isGpt, isXai, gptSizeIsCustom, supportsEdit, isMultimodal, busy, nodeTestForm, setForm, clearConversation,
    mainView, setMainView, sessionCount,
  } = props

  let body: ReactNode
  if (sidebarView === 'sysPrompt') {
    body = (
      <SystemPromptEditor
        key={systemPromptActiveId ?? '__new__'}
        presets={systemPromptPresets}
        activeId={systemPromptActiveId}
        activeTitle={activeSystemPromptTitle}
        activeContent={activeSystemPromptContent}
        onSave={onSavePreset}
        onDelete={onDeletePreset}
        onSelect={onSelectPreset}
        onClose={() => setSidebarView('params')}
      />
    )
  } else if (sidebarView === 'debug') {
    body = compareMode ? (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${token.colorBorder}`, flexShrink: 0 }}>
          <Segmented
            size="small"
            value={debugSide}
            onChange={(v) => setDebugSide(v as 'left' | 'right')}
            options={[
              { label: '左侧', value: 'left' },
              { label: '右侧', value: 'right' },
            ]}
          />
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <DebugInfoPanel data={debugSide === 'left' ? debugInfoLeft : debugInfoRight} onClose={() => setSidebarView('params')} />
        </div>
      </div>
    ) : (
      <DebugInfoPanel data={debugInfo} onClose={() => setSidebarView('params')} />
    )
  } else {
    body = (
      <>
        {/* 顶部 header：对比模式切换 + 新对话 + System Instructions + Debug Info 按钮 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${token.colorBorder}`, flexShrink: 0 }}>
          <Space size={8}>
            <Tooltip title="对比模式">
              <Button
                size="small"
                icon={<ColumnWidthOutlined />}
                type={compareMode ? 'primary' : 'default'}
                onClick={onToggleCompare}
              />
            </Tooltip>
            <Tooltip title="新对话">
              <Button size="small" icon={<PlusOutlined />} onClick={onNewConversation} />
            </Tooltip>
          </Space>
          <Space size={8}>
            <Tooltip title="System Instructions">
              <Button size="small" icon={<ProfileOutlined />} onClick={() => setSidebarView('sysPrompt')} />
            </Tooltip>
            <Tooltip title="Debug Info">
              <Button size="small" icon={<BugOutlined />} onClick={() => setSidebarView('debug')} />
            </Tooltip>
          </Space>
        </div>
        <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
          <ParamsPanel
            isImageMode={isImageMode}
            isModelScope={isModelScope}
            isGpt={isGpt}
            isXai={isXai}
            gptSizeIsCustom={gptSizeIsCustom}
            supportsEdit={supportsEdit}
            isMultimodal={isMultimodal}
            busy={busy}
            nodeTestForm={nodeTestForm}
            setForm={setForm}
            clearConversation={clearConversation}
          />
        </div>
        {/* 对话记录入口 */}
        <div style={{ padding: 16, borderTop: `1px solid ${token.colorBorder}`, flexShrink: 0 }}>
          <Tooltip title={compareMode ? '对比模式下不可用' : ''}>
            <Button block icon={<HistoryOutlined />}
              type={mainView === 'history' ? 'primary' : 'default'}
              onClick={() => setMainView(mainView === 'history' ? 'chat' : 'history')}
              disabled={compareMode}>
              对话记录 ({sessionCount})
            </Button>
          </Tooltip>
        </div>
      </>
    )
  }

  return (
    // flex:1 填满父列固定高度，minHeight:0 让内部各视图的 height:100%/flex:1 滚动（debug/sysPrompt/params）正确生效
    <div style={{ width: 320, background: token.colorBgElevated, borderLeft: `1px solid ${token.colorBorder}`, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {body}
    </div>
  )
}
