import { useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Popconfirm, Space, Typography, Upload, Select, Segmented, theme } from 'antd'
import { DownloadOutlined, DeleteOutlined, PictureOutlined, CloseOutlined, UploadOutlined, MessageOutlined } from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'
import { generateImage, streamChat } from '../../services/api'
import { genId } from '../../store/appStore'
import { imageHosts } from '../../services/imageHost'
import type { ProviderNode, TestHistoryItem, ImageInputMode } from '../../services/types'
import type { NodeTestForm } from '../../store/appStore'

const RESOLUTIONS = [
  { value: '1024x1024', label: '1024×1024（1:1）' },
  { value: '1280x720', label: '1280×720（16:9）' },
  { value: '720x1280', label: '720×1280（9:16）' },
  { value: '1024x768', label: '1024×768（4:3）' },
  { value: '768x1024', label: '768×1024（3:4）' },
]

type Phase = 'idle' | 'submitted' | 'polling' | 'done' | 'error' | 'streaming'

const PHASE_TEXT: Record<Phase, string> = {
  idle: '',
  submitted: '已提交任务，等待排队…',
  polling: '生成中…',
  streaming: '推理中…',
  done: '完成',
  error: '失败',
}

type TestMode = 'text' | 'image'

export default function NodeTestPage() {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const providers = useAppStore((s) => s.providers)
  const testHistory = useAppStore((s) => s.testHistory)
  const nodeTestFormPerNode = useAppStore((s) => s.nodeTestFormPerNode)
  const nodeTestGlobalForm = useAppStore((s) => s.nodeTestGlobalForm)
  const setState = useAppStore((s) => s.setState)
  const addTestHistory = useAppStore((s) => s.addTestHistory)
  const deleteTestHistory = useAppStore((s) => s.deleteTestHistory)

  // 测试模式：根据节点类型自动切换
  const [testMode, setTestMode] = useState<TestMode>('text')

  // 根据测试模式过滤可用节点
  const availableNodes = useMemo(() => {
    if (testMode === 'image') {
      return providers.filter((p) => p.nodeType === 'image' && p.enabled)
    } else {
      return providers.filter((p) => p.nodeType === 'text' && p.enabled)
    }
  }, [providers, testMode])

  const [phase, setPhase] = useState<Phase>('idle')
  const [statusText, setStatusText] = useState('')
  const [currentResult, setCurrentResult] = useState<string | null>(null) // 文本或图片 data URL
  const [currentTextResponse, setCurrentTextResponse] = useState<string>('') // 流式文本累积
  const [error, setError] = useState<string | null>(null)
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const [debugPayload, setDebugPayload] = useState<string>('')
  const [debugResponses, setDebugResponses] = useState<string>('')
  const acRef = useRef<AbortController | null>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => () => acRef.current?.abort(), [])

  const effectiveNodeId = nodeTestGlobalForm.nodeId
  const selectedNode: ProviderNode | undefined = effectiveNodeId
    ? availableNodes.find((n) => n.id === effectiveNodeId)
    : undefined

  // 当切换节点时，自动切换测试模式
  useEffect(() => {
    if (selectedNode) {
      setTestMode(selectedNode.nodeType === 'image' ? 'image' : 'text')
    }
  }, [selectedNode])

  // 派生当前节点的表单参数（含默认值）
  const nodeParams = effectiveNodeId ? nodeTestFormPerNode[effectiveNodeId] : {}
  const nodeTestForm: NodeTestForm = {
    provider: nodeTestGlobalForm.provider,
    nodeId: effectiveNodeId,
    prompt: nodeParams?.prompt ?? '',
    resolution: nodeParams?.resolution ?? '1024x1024',
    negativePrompt: nodeParams?.negativePrompt ?? '',
    steps: nodeParams?.steps,
    guidance: nodeParams?.guidance,
    seed: nodeParams?.seed,
    imageInputMode: nodeParams?.imageInputMode,
    temperature: nodeParams?.temperature ?? 0.7,
    topP: nodeParams?.topP ?? 0.9,
    topK: nodeParams?.topK,
    maxTokens: nodeParams?.maxTokens ?? 2000,
  }

  const isModelScope = nodeTestForm.provider === 'modelscope'
  const isImageMode = testMode === 'image'
  const supportsEdit = selectedNode?.supportsImageEdit ?? false
  const isMultimodal = selectedNode?.isMultimodal ?? false

  const setForm = (patch: Partial<NodeTestForm>) => {
    const nid = nodeTestGlobalForm.nodeId
    if (!nid) return
    setState({
      nodeTestFormPerNode: {
        ...nodeTestFormPerNode,
        [nid]: { ...nodeTestFormPerNode[nid], ...patch },
      },
    })
  }

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

  const handleGenerate = async () => {
    if (!selectedNode) {
      message.warning(`请先选择一个${isImageMode ? '图片生成' : '文本推理'}节点`)
      return
    }
    if (!nodeTestForm.prompt.trim()) {
      message.warning('请输入提示词')
      return
    }
    acRef.current?.abort()
    const ac = new AbortController()
    acRef.current = ac

    setPhase('idle')
    setStatusText('')
    setCurrentResult(null)
    setCurrentTextResponse('')
    setError(null)
    setDebugPayload('')
    setDebugResponses('')

    // 处理图片输入（图生图或多模态）
    const imageInputs: string[] = []
    const usedImageMode: ImageInputMode = nodeTestForm.imageInputMode || 'base64'
    if ((supportsEdit || isMultimodal) && selectedImages.length > 0) {
      if (usedImageMode === 'base64') {
        for (const file of selectedImages) {
          try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => resolve(reader.result as string)
              reader.onerror = reject
              reader.readAsDataURL(file)
            })
            imageInputs.push(dataUrl)
          } catch (e) {
            message.error(`图片读取失败：${e instanceof Error ? e.message : String(e)}`)
            return
          }
        }
      } else {
        const host = imageHosts[usedImageMode]
        if (!host) {
          message.error('未知图床')
          return
        }
        message.loading({ content: `正在上传到 ${host.name}...`, key: 'upload' })
        try {
          for (const file of selectedImages) {
            const url = await host.upload(file)
            imageInputs.push(url)
          }
          message.success({ content: '图片上传成功', key: 'upload', duration: 2 })
        } catch (e) {
          message.error({ content: `上传失败：${e instanceof Error ? e.message : String(e)}`, key: 'upload', duration: 3 })
          return
        }
      }
    }

    try {
      if (isImageMode) {
        // 图片生成模式
        const size = isModelScope ? nodeTestForm.resolution : undefined
        await generateImage(
          {
            baseURL: selectedNode.baseURL,
            apiKey: selectedNode.apiKey,
            model: selectedNode.model,
            prompt: nodeTestForm.prompt.trim(),
            ...(size ? { size } : {}),
            ...(nodeTestForm.negativePrompt?.trim() ? { negativePrompt: nodeTestForm.negativePrompt.trim() } : {}),
            ...(typeof nodeTestForm.steps === 'number' && nodeTestForm.steps > 0 ? { steps: nodeTestForm.steps } : {}),
            ...(typeof nodeTestForm.guidance === 'number' ? { guidance: nodeTestForm.guidance } : {}),
            ...(typeof nodeTestForm.seed === 'number' ? { seed: nodeTestForm.seed } : {}),
            ...(imageInputs.length > 0 ? { imageInputs } : {}),
          },
          {
            submitted: ({ taskId }) => {
              setPhase('submitted')
              setStatusText(`任务 ${taskId.slice(0, 12)}… 已提交`)
            },
            polling: ({ status, attempt }) => {
              setPhase('polling')
              setStatusText(`${status}（第 ${attempt} 次轮询）`)
            },
            done: ({ image: dataUrl }) => {
              setCurrentResult(dataUrl)
              setPhase('done')
              setStatusText('')
              addTestHistory({
                id: genId('test'),
                testType: 'image',
                imageResponse: dataUrl,
                prompt: nodeTestForm.prompt.trim(),
                modelName: selectedNode.model,
                nodeId: selectedNode.id,
                nodeType: 'image',
                ...(size ? { size } : {}),
                ...(nodeTestForm.negativePrompt?.trim() ? { negativePrompt: nodeTestForm.negativePrompt.trim() } : {}),
                ...(typeof nodeTestForm.steps === 'number' && nodeTestForm.steps > 0 ? { steps: nodeTestForm.steps } : {}),
                ...(typeof nodeTestForm.guidance === 'number' ? { guidance: nodeTestForm.guidance } : {}),
                ...(typeof nodeTestForm.seed === 'number' ? { seed: nodeTestForm.seed } : {}),
                ...(imageInputs.length > 0 ? { imageInputs, imageInputMode: usedImageMode } : {}),
                createdAt: new Date().toISOString(),
              })
            },
            debug: ({ stage, payload, response, error: dbgError }) => {
              if (payload !== undefined) {
                setDebugPayload(JSON.stringify(payload, null, 2))
              }
              const ts = new Date().toLocaleTimeString()
              const respBlock = response !== undefined ? JSON.stringify(response, null, 2) : '(无响应体)'
              const errLine = dbgError ? `\n  ⚠ ${dbgError}` : ''
              setDebugResponses((prev) => `${prev}[${ts}] ${stage}${errLine}\n${respBlock}\n\n`)
            },
          },
          ac.signal,
        )
      } else {
        // 文本推理模式（含多模态）
        setPhase('streaming')
        setCurrentTextResponse('')

        // 构造消息
        const messages: any[] = []
        if (isMultimodal && imageInputs.length > 0) {
          // 多模态：图片 + 文本
          const content: any[] = [{ type: 'text', text: nodeTestForm.prompt.trim() }]
          imageInputs.forEach(url => {
            content.push({ type: 'image_url', image_url: { url } })
          })
          messages.push({ role: 'user', content })
        } else {
          // 纯文本
          messages.push({ role: 'user', content: nodeTestForm.prompt.trim() })
        }

        await streamChat(
          {
            baseURL: selectedNode.baseURL,
            apiKey: selectedNode.apiKey,
            model: selectedNode.model,
            messages,
            ...(typeof nodeTestForm.temperature === 'number' ? { temperature: nodeTestForm.temperature } : {}),
            ...(typeof nodeTestForm.topP === 'number' ? { topP: nodeTestForm.topP } : {}),
            ...(typeof nodeTestForm.maxTokens === 'number' ? { maxTokens: nodeTestForm.maxTokens } : {}),
          },
          {
            delta: (delta) => {
              setCurrentTextResponse((prev) => prev + delta)
            },
            done: (fullText) => {
              setCurrentResult(fullText)
              setCurrentTextResponse(fullText)
              setPhase('done')
              setStatusText('')
              addTestHistory({
                id: genId('test'),
                testType: isMultimodal && imageInputs.length > 0 ? 'multimodal' : 'text',
                textResponse: fullText,
                prompt: nodeTestForm.prompt.trim(),
                modelName: selectedNode.model,
                nodeId: selectedNode.id,
                nodeType: 'text',
                ...(typeof nodeTestForm.temperature === 'number' ? { temperature: nodeTestForm.temperature } : {}),
                ...(typeof nodeTestForm.topP === 'number' ? { topP: nodeTestForm.topP } : {}),
                ...(typeof nodeTestForm.maxTokens === 'number' ? { maxTokens: nodeTestForm.maxTokens } : {}),
                ...(imageInputs.length > 0 ? { imageInputs, imageInputMode: usedImageMode } : {}),
                createdAt: new Date().toISOString(),
              })
            },
            error: (err) => {
              setError(err)
              setPhase('error')
              setStatusText('')
            },
          },
          ac.signal,
        )
      }
    } catch (e) {
      if (ac.signal.aborted) {
        setPhase('idle')
        setStatusText('')
        return
      }
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setPhase('error')
      setStatusText('')
    } finally {
      if (acRef.current === ac) acRef.current = null
    }
  }

  const handleCancel = () => {
    acRef.current?.abort()
    acRef.current = null
    setPhase('idle')
    setStatusText('')
  }

  const handleClickImage = (img: TestHistoryItem) => {
    if (img.imageResponse) {
      setCurrentResult(img.imageResponse)
    } else if (img.textResponse) {
      setCurrentResult(img.textResponse)
      setCurrentTextResponse(img.textResponse)
    }
    setForm({
      prompt: img.prompt,
      resolution: img.size || nodeTestForm.resolution,
      negativePrompt: img.negativePrompt || '',
      steps: img.steps ?? nodeTestForm.steps,
      guidance: img.guidance ?? nodeTestForm.guidance,
      seed: img.seed ?? nodeTestForm.seed,
      temperature: img.temperature ?? nodeTestForm.temperature,
      topP: img.topP ?? nodeTestForm.topP,
      maxTokens: img.maxTokens ?? nodeTestForm.maxTokens,
      ...(img.imageInputMode ? { imageInputMode: img.imageInputMode } : {}),
    })
    if (img.imageInputs && img.imageInputs.length > 0) {
      const modeName = img.imageInputMode
        ? imageHosts[img.imageInputMode as ImageInputMode]?.name ?? img.imageInputMode
        : 'Base64 直传'
      const modeLabel = img.testType === 'multimodal' ? '多模态输入' : '图生图'
      message.info(
        `此为${modeLabel}生成，使用 ${modeName} 输入了 ${img.imageInputs.length} 张图片（输入图片已不可恢复）`,
        3,
      )
    }
  }

  const downloadImage = (dataUrl: string, name: string) => {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${name}.jpg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleFileSelect = (file: File) => {
    setSelectedImages((prev) => [...prev, file])
    return false // 阻止自动上传
  }

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index))
  }

  const busy = phase === 'submitted' || phase === 'polling' || phase === 'streaming'
  const displayResult = currentResult || (testHistory.length > 0 ? (testHistory[0].imageResponse || testHistory[0].textResponse) : null)
  const isDisplayImage = displayResult && testHistory.length > 0 && testHistory[0].testType === 'image'

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 88px)', overflow: 'hidden', background: token.colorBgContainer }}>
      {/* 中间主画廊区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* 顶部选择器 */}
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${token.colorBorder}`, background: token.colorBgElevated }}>
          <Space size="large" style={{ width: '100%' }}>
            <div>
              <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>测试模式</Typography.Text>
              <Segmented
                value={testMode}
                onChange={(v) => {
                  setTestMode(v as TestMode)
                  // 切换模式时清空当前节点选择，让用户重新选择
                  setState({ nodeTestGlobalForm: { ...nodeTestGlobalForm, nodeId: undefined } })
                }}
                options={[
                  { label: '文本推理', value: 'text', icon: <MessageOutlined /> },
                  { label: '图片生成', value: 'image', icon: <PictureOutlined /> },
                ]}
              />
            </div>
            <div style={{ flex: 1 }}>
              <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>
                {testMode === 'text' ? '文本推理节点' : '图片生成节点'}
              </Typography.Text>
              <Select
                style={{ width: '100%', minWidth: 240 }}
                value={effectiveNodeId}
                onChange={(v) => setState({ nodeTestGlobalForm: { ...nodeTestGlobalForm, nodeId: v } })}
                placeholder={`选择${testMode === 'image' ? '图片生成' : '文本推理'}节点`}
                options={availableNodes.map((p) => ({
                  value: p.id,
                  label: (
                    <span>
                      {p.name}
                      {p.supportsImageEdit && ' 🖼️'}
                      {p.isMultimodal && ' 👁️'}
                    </span>
                  ),
                }))}
              />
            </div>
            {isImageMode && isModelScope && (
              <div>
                <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>分辨率</Typography.Text>
                <Select
                  style={{ width: 180 }}
                  value={nodeTestForm.resolution}
                  onChange={(v) => setForm({ resolution: v })}
                  options={RESOLUTIONS}
                />
              </div>
            )}
          </Space>
        </div>

        {/* 主展示区 */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', overflow: 'auto' }}>
          {displayResult ? (
            isDisplayImage ? (
              <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%' }}>
                <img
                  src={displayResult}
                  alt="生成结果"
                  style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 12, display: 'block', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
                />
                {busy && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.7)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 12,
                  }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      border: '3px solid rgba(88,166,255,0.3)',
                      borderTop: '3px solid #58a6ff',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }} />
                    <Typography.Text style={{ color: token.colorText, marginTop: 12 }}>生成中...</Typography.Text>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ maxWidth: '900px', width: '100%' }}>
                <div style={{
                  padding: '24px',
                  background: token.colorBgElevated,
                  borderRadius: 12,
                  border: `1px solid ${token.colorBorder}`,
                  boxShadow: token.boxShadow
                }}>
                  <Typography.Text style={{
                    color: token.colorText,
                    fontSize: 15,
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace',
                    display: 'block'
                  }}>
                    {currentTextResponse || displayResult}
                  </Typography.Text>
                  {busy && (
                    <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, paddingTop: 12, borderTop: `1px solid ${token.colorBorder}` }}>
                      <div style={{
                        width: 16,
                        height: 16,
                        border: `2px solid ${token.colorPrimary}33`,
                        borderTop: `2px solid ${token.colorPrimary}`,
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }} />
                      <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 13 }}>推理中...</Typography.Text>
                    </div>
                  )}
                </div>
              </div>
            )
          ) : (
            <div style={{ textAlign: 'center', opacity: 0.4 }}>
              {testMode === 'image' ? (
                <>
                  <PictureOutlined style={{ fontSize: 64, color: token.colorTextSecondary, marginBottom: 16 }} />
                  <Typography.Text style={{ color: token.colorTextSecondary, display: 'block', fontSize: 15 }}>选择图片生成节点，描述你想看到的画面</Typography.Text>
                  {availableNodes.some(n => n.supportsImageEdit) && (
                    <Typography.Text style={{ color: token.colorTextTertiary, display: 'block', fontSize: 13, marginTop: 8 }}>
                      支持图生图（Ctrl+V 粘贴或上传图片）
                    </Typography.Text>
                  )}
                </>
              ) : (
                <>
                  <MessageOutlined style={{ fontSize: 64, color: token.colorTextSecondary, marginBottom: 16 }} />
                  <Typography.Text style={{ color: token.colorTextSecondary, display: 'block', fontSize: 15 }}>选择文本推理节点，输入问题开始对话</Typography.Text>
                  {availableNodes.some(n => n.isMultimodal) && (
                    <Typography.Text style={{ color: token.colorTextTertiary, display: 'block', fontSize: 13, marginTop: 8 }}>
                      👁️ 多模态节点支持视觉理解（Ctrl+V 粘贴或上传图片）
                    </Typography.Text>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* 输入区 */}
        <div style={{ padding: '0 24px 24px', borderTop: '1px solid #30363d' }}>
          {/* 图片预览 */}
          {(supportsEdit || isMultimodal) && selectedImages.length > 0 && (
            <div style={{ marginBottom: 12, padding: 12, background: token.colorBgElevated, borderRadius: 8, border: `1px solid ${token.colorBorder}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12 }}>
                  {isImageMode ? '🖼️ 图生图输入' : '👁️ 多模态输入'} ({selectedImages.length} 张图片)
                </Typography.Text>
                <Button
                  size="small"
                  type="text"
                  danger
                  onClick={() => setSelectedImages([])}
                  style={{ fontSize: 11, padding: '0 4px', height: 20 }}
                >
                  清空
                </Button>
              </div>
              <Space wrap size={8}>
                {selectedImages.map((file, idx) => (
                  <div key={idx} style={{ position: 'relative', width: 80, height: 80 }}>
                    <img
                      src={URL.createObjectURL(file)}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
                    />
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<CloseOutlined />}
                      style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.7)', padding: 2, minWidth: 20, height: 20 }}
                      onClick={() => removeImage(idx)}
                    />
                  </div>
                ))}
              </Space>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            {(supportsEdit || isMultimodal) && (
              <Upload
                accept="image/*"
                multiple
                beforeUpload={handleFileSelect}
                showUploadList={false}
              >
                <Button
                  icon={<UploadOutlined />}
                  style={{ background: token.colorBgElevated, border: `1px solid ${token.colorBorder}`, color: token.colorText, height: 56 }}
                  title={isImageMode ? '上传图片用于图生图' : '上传图片用于多模态理解'}
                >
                  图片
                </Button>
              </Upload>
            )}
            <textarea
              ref={promptRef}
              value={nodeTestForm.prompt}
              onChange={(e) => setForm({ prompt: e.target.value })}
              placeholder={
                isImageMode
                  ? (supportsEdit && selectedImages.length > 0
                      ? "描述你想对图片做的修改..."
                      : "输入提示词，描述你想要的画面...")
                  : (isMultimodal && selectedImages.length > 0
                      ? "描述你的问题（已添加 " + selectedImages.length + " 张图片）..."
                      : isMultimodal
                        ? "输入问题开始对话（支持 Ctrl+V 粘贴图片进行多模态理解）..."
                        : "输入问题开始对话...")
              }
              disabled={busy}
              rows={2}
              style={{
                flex: 1,
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorder}`,
                borderRadius: 8,
                padding: 12,
                color: token.colorText,
                fontSize: 14,
                resize: 'none',
                fontFamily: 'inherit',
              }}
            />
            {busy ? (
              <Button danger onClick={handleCancel} style={{ height: 56 }}>
                取消
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<PictureOutlined />}
                onClick={handleGenerate}
                disabled={!selectedNode || !nodeTestForm.prompt.trim()}
                style={{ height: 56, background: '#1f6feb', borderColor: '#1f6feb' }}
              >
                {isImageMode ? '生成' : '推理'}
              </Button>
            )}
          </div>
          {busy && (
            <div style={{ marginTop: 8, color: token.colorTextSecondary, fontSize: 13 }}>
              {PHASE_TEXT[phase]} {statusText && <span>· {statusText}</span>}
            </div>
          )}
          {error && (
            <div style={{ marginTop: 8, padding: 12, background: '#da3633', color: '#fff', borderRadius: 6, fontSize: 13 }}>
              失败：{error}
            </div>
          )}
        </div>

        {/* 底部历史栏 */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid #30363d', background: token.colorBgElevated, overflowX: 'auto', overflowY: 'hidden' }}>
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12 }}>
              最近测试 ({testHistory.filter(item => isImageMode ? item.testType === 'image' : item.testType !== 'image').length})
            </Typography.Text>
            {selectedImages.length > 0 && (isMultimodal || supportsEdit) && (
              <Typography.Text style={{ color: token.colorPrimary, fontSize: 11 }}>
                💡 提示：已选择 {selectedImages.length} 张图片
              </Typography.Text>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {testHistory
              .filter(item => isImageMode ? item.testType === 'image' : item.testType !== 'image')
              .slice(0, 20)
              .map((item) => (
                <div
                  key={item.id}
                  style={{
                    position: 'relative',
                    width: 80,
                    height: 80,
                    flexShrink: 0,
                    cursor: 'pointer',
                    border: currentResult === (item.imageResponse || item.textResponse) ? '2px solid #58a6ff' : '2px solid transparent',
                    borderRadius: 6,
                    overflow: 'hidden',
                    background: token.colorBgContainer,
                  }}
                  onClick={() => handleClickImage(item)}
                >
                  {item.testType === 'image' && item.imageResponse ? (
                    <img src={item.imageResponse} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 4,
                      textAlign: 'center',
                      overflow: 'hidden'
                    }}>
                      <Typography.Text style={{ fontSize: 20, marginBottom: 4 }}>
                        {item.testType === 'multimodal' ? '👁️' : '💬'}
                      </Typography.Text>
                      <Typography.Text style={{ fontSize: 9, color: token.colorTextSecondary, lineHeight: 1.3 }} ellipsis>
                        {item.prompt.slice(0, 15)}
                      </Typography.Text>
                    </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 右侧设置面板 */}
      <div style={{ width: 320, background: token.colorBgElevated, borderLeft: `1px solid ${token.colorBorder}`, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 16, flex: 1 }}>
          <Typography.Title level={5} style={{ color: token.colorText, marginBottom: 16 }}>参数设置</Typography.Title>

          {isImageMode ? (
            <>
              <div style={{ marginBottom: 16 }}>
                <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>反向提示词</Typography.Text>
                <textarea
                  value={nodeTestForm.negativePrompt ?? ''}
                  onChange={(e) => setForm({ negativePrompt: e.target.value })}
                  placeholder="描述要避免的内容"
                  disabled={busy}
                  rows={3}
                  style={{
                    width: '100%',
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorder}`,
                    borderRadius: 6,
                    padding: 8,
                    color: token.colorText,
                    fontSize: 13,
                    resize: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {(supportsEdit || isMultimodal) && (
                <div style={{ marginBottom: 16 }}>
                  <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>图片输入方式</Typography.Text>
                  <Select
                    value={nodeTestForm.imageInputMode || 'base64'}
                    onChange={(mode) => setForm({ imageInputMode: mode as ImageInputMode })}
                    style={{ width: '100%' }}
                  >
                    <Select.Option value="base64">Base64 直传（推荐）</Select.Option>
                    <Select.OptGroup label="临时图床中转（适合大图片）">
                      <Select.Option value="catbox">Catbox（永久保留，≤200MB）</Select.Option>
                      <Select.Option value="litterbox">Litterbox（1-72小时，≤1GB）</Select.Option>
                      <Select.Option value="0x0">0x0.st（约30天，数十MB）</Select.Option>
                      <Select.Option value="telegraph">Telegraph（长期，≤5MB）</Select.Option>
                    </Select.OptGroup>
                  </Select>
                </div>
              )}

              {isModelScope && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>采样步数</Typography.Text>
                    <input
                      type="number"
                      value={nodeTestForm.steps ?? ''}
                      onChange={(e) => setForm({ steps: e.target.value ? parseInt(e.target.value) : undefined })}
                      placeholder="如 9"
                      disabled={busy}
                      min={1}
                      max={100}
                      style={{
                        width: '100%',
                        background: token.colorBgContainer,
                        border: `1px solid ${token.colorBorder}`,
                        borderRadius: 6,
                        padding: 8,
                        color: token.colorText,
                        fontSize: 13,
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>引导系数</Typography.Text>
                    <input
                      type="number"
                      value={nodeTestForm.guidance ?? ''}
                      onChange={(e) => setForm({ guidance: e.target.value ? parseFloat(e.target.value) : undefined })}
                      placeholder="如 4.0"
                      disabled={busy}
                      step={0.5}
                      style={{
                        width: '100%',
                        background: token.colorBgContainer,
                        border: `1px solid ${token.colorBorder}`,
                        borderRadius: 6,
                        padding: 8,
                        color: token.colorText,
                        fontSize: 13,
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>随机种子</Typography.Text>
                    <input
                      type="number"
                      value={nodeTestForm.seed ?? ''}
                      onChange={(e) => setForm({ seed: e.target.value ? parseInt(e.target.value) : undefined })}
                      placeholder="留空=随机"
                      disabled={busy}
                      min={0}
                      style={{
                        width: '100%',
                        background: token.colorBgContainer,
                        border: `1px solid ${token.colorBorder}`,
                        borderRadius: 6,
                        padding: 8,
                        color: token.colorText,
                        fontSize: 13,
                      }}
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>Temperature</Typography.Text>
                <input
                  type="number"
                  value={nodeTestForm.temperature ?? 0.7}
                  onChange={(e) => setForm({ temperature: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="0.7"
                  disabled={busy}
                  min={0}
                  max={2}
                  step={0.1}
                  style={{
                    width: '100%',
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorder}`,
                    borderRadius: 6,
                    padding: 8,
                    color: token.colorText,
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>Top P</Typography.Text>
                <input
                  type="number"
                  value={nodeTestForm.topP ?? 0.9}
                  onChange={(e) => setForm({ topP: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="0.9"
                  disabled={busy}
                  min={0}
                  max={1}
                  step={0.05}
                  style={{
                    width: '100%',
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorder}`,
                    borderRadius: 6,
                    padding: 8,
                    color: token.colorText,
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>Max Tokens</Typography.Text>
                <input
                  type="number"
                  value={nodeTestForm.maxTokens ?? 2000}
                  onChange={(e) => setForm({ maxTokens: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="2000"
                  disabled={busy}
                  min={1}
                  max={100000}
                  style={{
                    width: '100%',
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorder}`,
                    borderRadius: 6,
                    padding: 8,
                    color: token.colorText,
                    fontSize: 13,
                  }}
                />
              </div>

              {isMultimodal && (
                <div style={{ marginBottom: 16 }}>
                  <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>图片输入方式</Typography.Text>
                  <Select
                    value={nodeTestForm.imageInputMode || 'base64'}
                    onChange={(mode) => setForm({ imageInputMode: mode as ImageInputMode })}
                    style={{ width: '100%' }}
                  >
                    <Select.Option value="base64">Base64 直传（推荐）</Select.Option>
                    <Select.OptGroup label="临时图床中转（适合大图片）">
                      <Select.Option value="catbox">Catbox（永久保留，≤200MB）</Select.Option>
                      <Select.Option value="litterbox">Litterbox（1-72小时，≤1GB）</Select.Option>
                      <Select.Option value="0x0">0x0.st（约30天，数十MB）</Select.Option>
                      <Select.Option value="telegraph">Telegraph（长期，≤5MB）</Select.Option>
                    </Select.OptGroup>
                  </Select>
                </div>
              )}
            </>
          )}

          {(debugPayload || debugResponses) && (
            <>
              <Typography.Title level={5} style={{ color: token.colorText, marginTop: 24, marginBottom: 12 }}>调试信息</Typography.Title>
              <div style={{ marginBottom: 12 }}>
                <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 11 }}>Payload</Typography.Text>
                <pre style={{
                  background: token.colorBgContainer,
                  border: `1px solid ${token.colorBorder}`,
                  borderRadius: 6,
                  padding: 8,
                  fontSize: 11,
                  color: token.colorText,
                  maxHeight: 150,
                  overflow: 'auto',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>
                  {debugPayload || '—'}
                </pre>
              </div>
              <div>
                <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 11 }}>Response</Typography.Text>
                <pre style={{
                  background: token.colorBgContainer,
                  border: `1px solid ${token.colorBorder}`,
                  borderRadius: 6,
                  padding: 8,
                  fontSize: 11,
                  color: token.colorText,
                  maxHeight: 200,
                  overflow: 'auto',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>
                  {debugResponses || '—'}
                </pre>
              </div>
            </>
          )}
        </div>

        {/* 底部历史管理 */}
        <div style={{ padding: 16, borderTop: '1px solid #30363d' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Typography.Text style={{ color: token.colorText, fontSize: 14 }}>测试历史 ({testHistory.length})</Typography.Text>
            {testHistory.length > 0 && (
              <Popconfirm
                title="清空全部历史？"
                okText="清空"
                okButtonProps={{ danger: true }}
                cancelText="取消"
                onConfirm={() => testHistory.forEach((i) => deleteTestHistory(i.id))}
              >
                <Button size="small" danger icon={<DeleteOutlined />} style={{ fontSize: 12 }}>
                  清空
                </Button>
              </Popconfirm>
            )}
          </div>
          {testHistory.length === 0 ? (
            <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12 }}>尚未进行测试</Typography.Text>
          ) : (
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  {testHistory.slice(0, 10).map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleClickImage(item)}
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        padding: 8,
                        background: token.colorBgContainer,
                        borderRadius: 6,
                        border: `1px solid ${token.colorBorder}`,
                        cursor: 'pointer',
                        transition: 'border-color 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#58a6ff' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#30363d' }}
                    >
                      {item.testType === 'image' && item.imageResponse ? (
                        <img src={item.imageResponse} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                      ) : (
                        <div style={{
                          width: 40,
                          height: 40,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: token.colorBgElevated,
                          borderRadius: 4,
                          fontSize: 18
                        }}>
                          {item.testType === 'multimodal' ? '👁️' : '💬'}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <Typography.Text ellipsis style={{ color: token.colorText, fontSize: 12, flex: 1 }}>
                            {item.prompt.slice(0, 25)}
                          </Typography.Text>
                          {item.testType === 'image' && (
                            <span style={{
                              fontSize: 9,
                              padding: '1px 4px',
                              borderRadius: 3,
                              background: '#6e40c9',
                              color: '#fff',
                              lineHeight: 1,
                              flexShrink: 0
                            }}>图片</span>
                          )}
                          {item.testType === 'multimodal' && (
                            <span style={{
                              fontSize: 9,
                              padding: '1px 4px',
                              borderRadius: 3,
                              background: '#1f6feb',
                              color: '#fff',
                              lineHeight: 1,
                              flexShrink: 0
                            }}>多模态</span>
                          )}
                          {item.testType === 'text' && (
                            <span style={{
                              fontSize: 9,
                              padding: '1px 4px',
                              borderRadius: 3,
                              background: '#238636',
                              color: '#fff',
                              lineHeight: 1,
                              flexShrink: 0
                            }}>文本</span>
                          )}
                        </div>
                        <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 10 }}>
                          {item.modelName}
                        </Typography.Text>
                      </div>
                      <Space size={4}>
                        {item.testType === 'image' && item.imageResponse && (
                          <Button
                            size="small"
                            type="text"
                            icon={<DownloadOutlined />}
                            onClick={(e) => { e.stopPropagation(); downloadImage(item.imageResponse!, `test-${item.id}`) }}
                            style={{ color: token.colorTextSecondary }}
                          />
                        )}
                        <Popconfirm
                          title="删除？"
                          okText="删除"
                          okButtonProps={{ danger: true }}
                          cancelText="取消"
                          onConfirm={() => deleteTestHistory(item.id)}
                        >
                          <Button
                            size="small"
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={(e) => e.stopPropagation()}
                            style={{ color: '#da3633' }}
                          />
                        </Popconfirm>
                      </Space>
                    </div>
                  ))}
              </Space>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
