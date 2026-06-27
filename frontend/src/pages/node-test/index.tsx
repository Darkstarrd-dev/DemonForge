// 节点测试页 · 布局编排（A-8 深度拆分收口）。
// 推理收发逻辑下沉到 hooks/useInferenceSession；表单派生到 hooks/useNodeTestForm；
// 渲染拆到 ChatTranscript/CompareColumn/ImageGallery/ChatComposer/NodeTestSidebar。
// 本文件仅留：UI 视图态（testMode/mainView/sidebarView/bottomMenu/compareMode/selectedImages）、
// 节点类型切换拦截、粘贴图片监听、节点分组/挑选，以及把上述组件接线到一起。
import { useEffect, useMemo, useRef, useState } from 'react'
import { App, theme, Modal } from 'antd'
import { PictureOutlined, MessageOutlined, CopyOutlined } from '@ant-design/icons'
import { Button, Typography } from 'antd'
import { useAppStore } from '../../store/appStore'
import { pushSettingsNow } from '../../store/appStore'
import type { ProviderNode, ProviderNodeType } from '../../services/types'
import HistoryList from './HistoryList'
import ChatTranscript from './ChatTranscript'
import CompareColumn from './CompareColumn'
import ImageGallery from './ImageGallery'
import ChatComposer from './ChatComposer'
import NodeTestSidebar from './NodeTestSidebar'
import { GPT_SIZES } from './constants'
import type { TestMode } from './types'
import { useNodeTestForm } from './hooks/useNodeTestForm'
import { useInferenceSession } from './hooks/useInferenceSession'

export default function NodeTestPage() {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const providers = useAppStore((s) => s.providers)
  const nodeGroupExpanded = useAppStore((s) => s.nodeGroupExpanded)
  const setState = useAppStore((s) => s.setState)
  const chatSessions = useAppStore((s) => s.chatSessions)
  const activeChatSessionId = useAppStore((s) => s.activeChatSessionId)
  const renameChatSession = useAppStore((s) => s.renameChatSession)
  const deleteChatSession = useAppStore((s) => s.deleteChatSession)
  const deleteChatSessions = useAppStore((s) => s.deleteChatSessions)
  const setActiveChatSessionId = useAppStore((s) => s.setActiveChatSessionId)
  const systemPromptPresets = useAppStore((s) => s.systemPromptPresets)
  const systemPromptActiveId = useAppStore((s) => s.systemPromptActiveId)
  const saveSystemPromptPreset = useAppStore((s) => s.saveSystemPromptPreset)
  const deleteSystemPromptPreset = useAppStore((s) => s.deleteSystemPromptPreset)
  const setSystemPromptActiveId = useAppStore((s) => s.setSystemPromptActiveId)

  // ===== UI 视图态 =====
  const [testMode, setTestMode] = useState<TestMode>('text')
  const [mainView, setMainView] = useState<'chat' | 'history'>('chat')
  const [sidebarView, setSidebarView] = useState<'params' | 'sysPrompt' | 'debug'>('params')
  const [bottomMenuOpen, setBottomMenuOpen] = useState(false)
  const [compareMode, setCompareMode] = useState(false)
  const [activeSide, setActiveSide] = useState<'left' | 'right'>('left')
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const prevNodeTypeRef = useRef<ProviderNodeType | undefined>(undefined)

  // 表单派生（含默认值）+ setForm
  const { nodeTestForm, setForm, effectiveNodeId, nodeTestGlobalForm } = useNodeTestForm()

  // 根据测试模式过滤可用节点
  const availableNodes = useMemo(() => {
    if (testMode === 'image') {
      return providers.filter((p) => p.nodeType === 'image' && p.enabled)
    } else {
      return providers.filter((p) => p.nodeType === 'text' && p.enabled)
    }
  }, [providers, testMode])

  const selectedNode: ProviderNode | undefined = effectiveNodeId
    ? availableNodes.find((n) => n.id === effectiveNodeId)
    : undefined

  const isImageMode = testMode === 'image'
  const nodeProtocol = selectedNode?.protocol ?? 'modelscope'
  const isModelScope = isImageMode && nodeProtocol === 'modelscope'
  const isGpt = isImageMode && nodeProtocol === 'gpt'
  const isXai = isImageMode && nodeProtocol === 'xai'
  const gptSizeIsCustom = isGpt && nodeTestForm.resolution !== '' && !GPT_SIZES.some((s) => s.value === nodeTestForm.resolution)
  const supportsEdit = selectedNode?.supportsImageEdit ?? false
  const isMultimodal = selectedNode?.isMultimodal ?? false

  // 当前激活的 System Prompt 预设（全局共享，发送时取其 content）
  const activeSystemPromptPreset = useMemo(
    () => systemPromptPresets.find((p) => p.id === systemPromptActiveId) ?? null,
    [systemPromptPresets, systemPromptActiveId],
  )
  const activeSystemPrompt = activeSystemPromptPreset?.content ?? ''

  // 推理收发（单栏引擎 + 对比本地态 + 编辑态 + 计时/滚动 effect）
  const inf = useInferenceSession({
    testMode, selectedNode, availableNodes, isImageMode, isGpt, isXai, isMultimodal,
    supportsEdit, nodeProtocol, nodeTestForm, activeSystemPrompt, compareMode,
    selectedImages, setSelectedImages, setForm,
  })

  const showImageInput = supportsEdit || isMultimodal || isGpt || isXai

  // 从 AppLayout 常驻侧栏切换/新建 session 时：同步测试模式并回到对话视图
  useEffect(() => {
    setMainView('chat')
    if (!activeChatSessionId) return
    const s = useAppStore.getState().chatSessions.find((c) => c.id === activeChatSessionId)
    if (s) setTestMode(s.testType === 'image' ? 'image' : 'text')
  }, [activeChatSessionId])

  // 当切换节点时，检测节点类型变化并拦截
  useEffect(() => {
    if (!selectedNode) {
      prevNodeTypeRef.current = undefined
      return
    }

    const currentNodeType = selectedNode.nodeType
    const prevNodeType = prevNodeTypeRef.current

    // 首次选择节点或节点类型未变化
    if (!prevNodeType || prevNodeType === currentNodeType) {
      prevNodeTypeRef.current = currentNodeType
      setTestMode(currentNodeType === 'image' ? 'image' : 'text')
      return
    }

    // 节点类型发生变化（text ↔ image），且当前有对话内容
    if (inf.chatMessages.length > 0) {
      const targetMode = currentNodeType === 'image' ? '图片生成' : '文本推理'
      Modal.confirm({
        title: `切换到${targetMode}模式`,
        content: `当前对话包含消息，切换模式将清空对话。是否继续？`,
        okText: '继续',
        cancelText: '取消',
        onOk: () => {
          prevNodeTypeRef.current = currentNodeType
          setTestMode(currentNodeType === 'image' ? 'image' : 'text')
          setActiveChatSessionId(null)
        },
        onCancel: () => {
          // 恢复到上一个节点：找到上一个节点类型的第一个节点
          const prevNodes = availableNodes.filter((n) => n.nodeType === prevNodeType)
          if (prevNodes.length > 0) {
            setState({ nodeTestGlobalForm: { ...nodeTestGlobalForm, nodeId: prevNodes[0].id } })
          }
        },
      })
    } else {
      // 无对话内容，直接切换
      prevNodeTypeRef.current = currentNodeType
      setTestMode(currentNodeType === 'image' ? 'image' : 'text')
      setActiveChatSessionId(null)
    }
  }, [selectedNode, inf.chatMessages.length, availableNodes, nodeTestGlobalForm, setState])

  // 粘贴图片监听（图生图或多模态时启用）
  useEffect(() => {
    if (!supportsEdit && !isMultimodal) return
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const imageFiles: File[] = []
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile()
          if (file) imageFiles.push(file)
        }
      }
      if (imageFiles.length > 0) {
        setSelectedImages((prev) => [...prev, ...imageFiles])
        message.success(`已粘贴 ${imageFiles.length} 张图片`)
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [supportsEdit, isMultimodal, message])

  const handleFileSelect = (file: File) => {
    setSelectedImages((prev) => [...prev, file])
    return false // 阻止自动上传
  }

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index))
  }

  // 节点池按 baseURL + 节点组名分组
  const groupedProviders = availableNodes.reduce((acc, node) => {
    const groupName = node.name.replace(/\s*\([^)]*\)\s*$/, '').trim() || node.baseURL
    const key = `${node.baseURL}|||${groupName}` // 组合键：URL + 组名
    if (!acc[key]) {
      acc[key] = { groupName, baseURL: node.baseURL, nodes: [] }
    }
    acc[key].nodes.push(node)
    return acc
  }, {} as Record<string, { groupName: string; baseURL: string; nodes: ProviderNode[] }>)

  // 切换分组展开/折叠，并持久化
  const toggleGroup = (groupKey: string) => {
    const newState = { ...nodeGroupExpanded, [groupKey]: !(nodeGroupExpanded[groupKey] ?? true) }
    setState({ nodeGroupExpanded: newState })
    pushSettingsNow()
  }

  // 底部菜单挑选节点：对比模式按 activeSide 设左右，单栏直接设全局
  const onPickNode = (nodeId: string) => {
    if (compareMode) {
      if (activeSide === 'left') {
        inf.setSelectedNodeIdLeftWrapped(nodeId)
        if (inf.selectedNodeIdRightRef.current) setBottomMenuOpen(false)
        else setActiveSide('right')
      } else {
        inf.setSelectedNodeIdRightWrapped(nodeId)
        if (inf.selectedNodeIdLeftRef.current) setBottomMenuOpen(false)
        else setActiveSide('left')
      }
    } else {
      setState({ nodeTestGlobalForm: { ...nodeTestGlobalForm, nodeId } })
      setBottomMenuOpen(false)
    }
  }

  const onChangeTestMode = (v: TestMode) => {
    setTestMode(v)
    setState({ nodeTestGlobalForm: { ...nodeTestGlobalForm, nodeId: undefined } })
    setActiveChatSessionId(null)
  }

  // 切对比模式：有对话时先确认清空
  const onToggleCompare = () => {
    if (!compareMode && (inf.chatMessages.length > 0 || activeChatSessionId)) {
      Modal.confirm({
        title: '切换到对比模式',
        content: '对比模式下将清空当前对话并禁用历史记录。是否继续？',
        okText: '继续',
        cancelText: '取消',
        onOk: () => {
          setCompareMode(true)
          setActiveChatSessionId(null)
        },
      })
    } else {
      setCompareMode(!compareMode)
    }
  }

  const onAsInput = (dataUrl: string) => {
    fetch(dataUrl).then(r => r.blob()).then(blob => {
      const file = new File([blob], `generated-${Date.now()}.png`, { type: 'image/png' })
      setSelectedImages(prev => [...prev, file])
      message.success('已加入输入区')
    }).catch(() => message.error('操作失败'))
  }

  const hasMessages = (compareMode && (inf.chatMessagesLeft.length > 0 || inf.chatMessagesRight.length > 0)) || (!compareMode && inf.chatMessages.length > 0)

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: token.colorBgContainer }}>
      {/* 主内容区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {mainView === 'history' ? (
          <HistoryList
            sessions={chatSessions}
            onSelect={(id) => {
              const s = chatSessions.find((c: { id: string }) => c.id === id)
              if (s) {
                setActiveChatSessionId(id)
                setTestMode(s.testType === 'image' ? 'image' : 'text')
                setMainView('chat')
              }
            }}
            onRename={(id, title) => renameChatSession(id, title)}
            onDelete={(id) => deleteChatSession(id)}
            onDeleteMany={(ids) => deleteChatSessions(ids)}
            onExit={() => setMainView('chat')}
          />
        ) : (
          <>
            {hasMessages && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 16px', flexShrink: 0 }}>
                <Button size="small" icon={<CopyOutlined />} onClick={inf.copyAllMessages} />
              </div>
            )}
            {/* 主展示区 */}
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
              {!selectedNode ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4, padding: 24 }}>
                  {testMode === 'image' ? (
                    <>
                      <PictureOutlined style={{ fontSize: 64, color: token.colorTextSecondary, marginBottom: 16 }} />
                      <Typography.Text style={{ color: token.colorTextSecondary, display: 'block', fontSize: 15 }}>选择图片生成节点开始测试</Typography.Text>
                    </>
                  ) : (
                    <>
                      <MessageOutlined style={{ fontSize: 64, color: token.colorTextSecondary, marginBottom: 16 }} />
                      <Typography.Text style={{ color: token.colorTextSecondary, display: 'block', fontSize: 15 }}>选择文本推理节点开始对话</Typography.Text>
                    </>
                  )}
                </div>
              ) : isImageMode ? (
                <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
                  <ImageGallery
                    chatMessages={inf.chatMessages}
                    busy={inf.busy}
                    statusText={inf.statusText}
                    elapsed={inf.elapsed}
                    onAsInput={onAsInput}
                    onRetry={inf.handleGenerate}
                    chatEndRef={inf.chatEndRef}
                  />
                </div>
              ) : compareMode ? (
                <div style={{ display: 'flex', height: '100%', padding: '24px 0 0' }}>
                  <CompareColumn
                    side="left"
                    label={`左侧 ${inf.selectedNodeIdLeft ? `· ${availableNodes.find(n => n.id === inf.selectedNodeIdLeft)?.model || ''}` : '（未选择节点）'}`}
                    messages={inf.chatMessagesLeft}
                    phase={inf.phaseLeft}
                    editingMsgId={inf.editingMsgId}
                    editingSide={inf.editingCompareSide}
                    editingText={inf.editingText}
                    setEditingText={inf.setEditingText}
                    onRetry={(id) => inf.retryCompareMessage('left', id)}
                    onEdit={(id) => inf.editCompareMessage('left', id)}
                    onDelete={(id) => inf.deleteCompareMessage('left', id)}
                    onCommitEdit={inf.commitCompareEdit}
                    onCancelEdit={inf.cancelCompareEdit}
                    copyText={inf.copyText}
                  />
                  <CompareColumn
                    side="right"
                    label={`右侧 ${inf.selectedNodeIdRight ? `· ${availableNodes.find(n => n.id === inf.selectedNodeIdRight)?.model || ''}` : '（未选择节点）'}`}
                    messages={inf.chatMessagesRight}
                    phase={inf.phaseRight}
                    editingMsgId={inf.editingMsgId}
                    editingSide={inf.editingCompareSide}
                    editingText={inf.editingText}
                    setEditingText={inf.setEditingText}
                    onRetry={(id) => inf.retryCompareMessage('right', id)}
                    onEdit={(id) => inf.editCompareMessage('right', id)}
                    onDelete={(id) => inf.deleteCompareMessage('right', id)}
                    onCommitEdit={inf.commitCompareEdit}
                    onCancelEdit={inf.cancelCompareEdit}
                    copyText={inf.copyText}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 900, width: '100%', margin: '0 auto', height: '100%', padding: '24px 24px 0' }}>
                  <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                    <ChatTranscript
                      chatMessages={inf.chatMessages}
                      phase={inf.phase}
                      busy={inf.busy}
                      editingMsgId={inf.editingMsgId}
                      editingText={inf.editingText}
                      setEditingText={inf.setEditingText}
                      lastAssistantMeta={inf.lastAssistantMeta}
                      modelChanges={inf.modelChanges}
                      onRetry={inf.retryMessage}
                      copyText={inf.copyText}
                      onEdit={inf.editMessage}
                      onDelete={inf.deleteMessage}
                      onCommitEdit={inf.commitEdit}
                      onCancelEdit={inf.cancelEdit}
                      chatEndRef={inf.chatEndRef}
                    />
                  </div>
                </div>
              )}
            </div>

            <ChatComposer
              showImageInput={showImageInput}
              selectedImages={selectedImages}
              removeImage={removeImage}
              bottomMenuOpen={bottomMenuOpen}
              setBottomMenuOpen={setBottomMenuOpen}
              compareMode={compareMode}
              activeSide={activeSide}
              setActiveSide={setActiveSide}
              testMode={testMode}
              onChangeTestMode={onChangeTestMode}
              groupedProviders={groupedProviders}
              availableNodesCount={availableNodes.length}
              nodeGroupExpanded={nodeGroupExpanded}
              toggleGroup={toggleGroup}
              effectiveNodeId={effectiveNodeId}
              selectedNodeIdLeft={inf.selectedNodeIdLeft}
              selectedNodeIdRight={inf.selectedNodeIdRight}
              onPickNode={onPickNode}
              isImageMode={isImageMode}
              isMultimodal={isMultimodal}
              supportsEdit={supportsEdit}
              selectedNode={selectedNode}
              nodeTestForm={nodeTestForm}
              setForm={setForm}
              handleKeyDown={inf.handleKeyDown}
              promptRef={promptRef}
              handleFileSelect={handleFileSelect}
              busy={inf.busy}
              handleCancel={inf.handleCancel}
              handleGenerate={inf.handleGenerate}
            />
          </>
        )}
      </div>

      {/* 右侧设置面板 */}
      <div style={{ width: 320, background: token.colorBgElevated, borderLeft: `1px solid ${token.colorBorder}`, display: 'flex', flexDirection: 'column' }}>
        <NodeTestSidebar
          sidebarView={sidebarView}
          setSidebarView={setSidebarView}
          systemPromptPresets={systemPromptPresets}
          systemPromptActiveId={systemPromptActiveId}
          activeSystemPromptTitle={activeSystemPromptPreset?.title ?? ''}
          activeSystemPromptContent={activeSystemPromptPreset?.content ?? ''}
          onSavePreset={saveSystemPromptPreset}
          onDeletePreset={deleteSystemPromptPreset}
          onSelectPreset={setSystemPromptActiveId}
          compareMode={compareMode}
          debugSide={inf.debugSide}
          setDebugSide={inf.setDebugSide}
          debugInfo={inf.debugInfo}
          debugInfoLeft={inf.debugInfoLeft}
          debugInfoRight={inf.debugInfoRight}
          onToggleCompare={onToggleCompare}
          onNewConversation={inf.clearConversation}
          isImageMode={isImageMode}
          isModelScope={isModelScope}
          isGpt={isGpt}
          isXai={isXai}
          gptSizeIsCustom={gptSizeIsCustom}
          supportsEdit={supportsEdit}
          isMultimodal={isMultimodal}
          busy={inf.busy}
          nodeTestForm={nodeTestForm}
          setForm={setForm}
          clearConversation={inf.clearConversation}
          mainView={mainView}
          setMainView={setMainView}
          sessionCount={chatSessions.length}
        />
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
