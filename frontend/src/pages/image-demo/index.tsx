import { useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Popconfirm, Space, Typography, Upload, Select } from 'antd'
import { DownloadOutlined, DeleteOutlined, PictureOutlined, CloseOutlined, UploadOutlined } from '@ant-design/icons'
import { useAppStore } from '../../store/appStore'
import { generateImage } from '../../services/api'
import { genId } from '../../store/appStore'
import { imageHosts } from '../../services/imageHost'
import type { ProviderNode } from '../../services/types'
import type { ImageDemoForm } from '../../store/appStore'

const RESOLUTIONS = [
  { value: '1024x1024', label: '1024×1024（1:1）' },
  { value: '1280x720', label: '1280×720（16:9）' },
  { value: '720x1280', label: '720×1280（9:16）' },
  { value: '1024x768', label: '1024×768（4:3）' },
  { value: '768x1024', label: '768×1024（3:4）' },
]

type Phase = 'idle' | 'submitted' | 'polling' | 'done' | 'error'

const PHASE_TEXT: Record<Phase, string> = {
  idle: '',
  submitted: '已提交任务，等待排队…',
  polling: '生成中…',
  done: '生成完成',
  error: '生成失败',
}

export default function ImageDemoPage() {
  const { message } = App.useApp()
  const providers = useAppStore((s) => s.providers)
  const imageGallery = useAppStore((s) => s.imageGallery)
  const imageDemoFormPerNode = useAppStore((s) => s.imageDemoFormPerNode)
  const imageDemoGlobalForm = useAppStore((s) => s.imageDemoGlobalForm)
  const setState = useAppStore((s) => s.setState)
  const addImage = useAppStore((s) => s.addImage)
  const deleteImage = useAppStore((s) => s.deleteImage)

  const imageNodes = useMemo(
    () => providers.filter((p) => p.nodeType === 'image' && p.enabled),
    [providers],
  )

  const [phase, setPhase] = useState<Phase>('idle')
  const [statusText, setStatusText] = useState('')
  const [currentImage, setCurrentImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const [debugPayload, setDebugPayload] = useState<string>('')
  const [debugResponses, setDebugResponses] = useState<string>('')
  const acRef = useRef<AbortController | null>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => () => acRef.current?.abort(), [])

  const effectiveNodeId = imageDemoGlobalForm.nodeId
  const selectedNode: ProviderNode | undefined = effectiveNodeId
    ? imageNodes.find((n) => n.id === effectiveNodeId)
    : undefined

  // 派生当前节点的表单参数（含默认值）
  const nodeParams = effectiveNodeId ? imageDemoFormPerNode[effectiveNodeId] : {}
  const imageDemoForm: ImageDemoForm = {
    provider: imageDemoGlobalForm.provider,
    nodeId: effectiveNodeId,
    prompt: nodeParams?.prompt ?? '',
    resolution: nodeParams?.resolution ?? '1024x1024',
    negativePrompt: nodeParams?.negativePrompt ?? '',
    steps: nodeParams?.steps,
    guidance: nodeParams?.guidance,
    seed: nodeParams?.seed,
    imageInputMode: nodeParams?.imageInputMode,
  }

  const isModelScope = imageDemoForm.provider === 'modelscope'
  const supportsEdit = selectedNode?.supportsImageEdit ?? false

  const setForm = (patch: Partial<ImageDemoForm>) => {
    const nid = imageDemoGlobalForm.nodeId
    if (!nid) return
    setState({
      imageDemoFormPerNode: {
        ...imageDemoFormPerNode,
        [nid]: { ...imageDemoFormPerNode[nid], ...patch },
      },
    })
  }

  // 粘贴图片监听
  useEffect(() => {
    if (!supportsEdit) return
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
  }, [supportsEdit, message])

  const handleGenerate = async () => {
    if (!selectedNode) {
      message.warning('请先选择一个文生图节点')
      return
    }
    if (!imageDemoForm.prompt.trim()) {
      message.warning('请输入文生图 prompt')
      return
    }
    acRef.current?.abort()
    const ac = new AbortController()
    acRef.current = ac

    setPhase('idle')
    setStatusText('')
    setCurrentImage(null)
    setError(null)
    setDebugPayload('')
    setDebugResponses('')

    const size = isModelScope ? imageDemoForm.resolution : undefined

    // 转换图片为 Base64 或上传图床
    const imageInputs: string[] = []
    const usedImageMode: string = imageDemoForm.imageInputMode || 'base64'
    if (supportsEdit && selectedImages.length > 0) {
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
        if (!host || usedImageMode === 'base64') {
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
      await generateImage(
        {
          baseURL: selectedNode.baseURL,
          apiKey: selectedNode.apiKey,
          model: selectedNode.model,
          prompt: imageDemoForm.prompt.trim(),
          ...(size ? { size } : {}),
          ...(imageDemoForm.negativePrompt?.trim() ? { negativePrompt: imageDemoForm.negativePrompt.trim() } : {}),
          ...(typeof imageDemoForm.steps === 'number' && imageDemoForm.steps > 0 ? { steps: imageDemoForm.steps } : {}),
          ...(typeof imageDemoForm.guidance === 'number' ? { guidance: imageDemoForm.guidance } : {}),
          ...(typeof imageDemoForm.seed === 'number' ? { seed: imageDemoForm.seed } : {}),
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
            setCurrentImage(dataUrl)
            setPhase('done')
            setStatusText('')
            addImage({
              id: genId('img'),
              dataUrl,
              prompt: imageDemoForm.prompt.trim(),
              modelName: selectedNode.model,
              nodeId: selectedNode.id,
              ...(size ? { size } : {}),
              ...(imageDemoForm.negativePrompt?.trim() ? { negativePrompt: imageDemoForm.negativePrompt.trim() } : {}),
              ...(typeof imageDemoForm.steps === 'number' && imageDemoForm.steps > 0 ? { steps: imageDemoForm.steps } : {}),
              ...(typeof imageDemoForm.guidance === 'number' ? { guidance: imageDemoForm.guidance } : {}),
              ...(typeof imageDemoForm.seed === 'number' ? { seed: imageDemoForm.seed } : {}),
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

  const handleClickImage = (img: typeof imageGallery[number]) => {
    setCurrentImage(img.dataUrl)
    setForm({
      prompt: img.prompt,
      resolution: img.size || imageDemoForm.resolution,
      negativePrompt: img.negativePrompt || '',
      steps: img.steps ?? imageDemoForm.steps,
      guidance: img.guidance ?? imageDemoForm.guidance,
      seed: img.seed ?? imageDemoForm.seed,
      ...(img.imageInputMode ? { imageInputMode: img.imageInputMode } : {}),
    })
    if (img.imageInputs && img.imageInputs.length > 0) {
      const modeName = img.imageInputMode
        ? imageHosts[img.imageInputMode]?.name ?? img.imageInputMode
        : 'Base64 直传'
      message.info(
        `此图为图生图模式生成，使用 ${modeName} 输入了 ${img.imageInputs.length} 张图片（输入图片已不可恢复）`,
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

  const busy = phase === 'submitted' || phase === 'polling'
  const displayImage = currentImage || (imageGallery.length > 0 ? imageGallery[0].dataUrl : null)

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 80px)', overflow: 'hidden', background: '#0d1117' }}>
      {/* 中间主画廊区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* 顶部选择器 */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #30363d', background: '#161b22' }}>
          <Space size="middle">
            <div>
              <Typography.Text style={{ color: '#8b949e', fontSize: 12, display: 'block', marginBottom: 4 }}>节点</Typography.Text>
              <Select
                style={{ width: 240 }}
                value={effectiveNodeId}
                onChange={(v) => setState({ imageDemoGlobalForm: { ...imageDemoGlobalForm, nodeId: v } })}
                placeholder="选择文生图节点"
                options={imageNodes.map((p) => ({
                  value: p.id,
                  label: `${p.name}${p.supportsImageEdit ? ' 🖼️' : ''}`,
                }))}
              />
            </div>
            {isModelScope && (
              <div>
                <Typography.Text style={{ color: '#8b949e', fontSize: 12, display: 'block', marginBottom: 4 }}>分辨率</Typography.Text>
                <Select
                  style={{ width: 180 }}
                  value={imageDemoForm.resolution}
                  onChange={(v) => setForm({ resolution: v })}
                  options={RESOLUTIONS}
                />
              </div>
            )}
          </Space>
        </div>

        {/* 主图展示区 */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', overflow: 'auto' }}>
          {displayImage ? (
            <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%' }}>
              <img
                src={displayImage}
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
                  <Typography.Text style={{ color: '#c9d1d9', marginTop: 12 }}>正在生成新画面...</Typography.Text>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', opacity: 0.3 }}>
              <PictureOutlined style={{ fontSize: 64, color: '#8b949e', marginBottom: 16 }} />
              <Typography.Text style={{ color: '#8b949e', display: 'block' }}>选择节点，描述你想看到的画面</Typography.Text>
            </div>
          )}
        </div>

        {/* 输入区 */}
        <div style={{ padding: '0 24px 24px', borderTop: '1px solid #30363d' }}>
          {/* 图片预览 */}
          {supportsEdit && selectedImages.length > 0 && (
            <div style={{ marginBottom: 12, padding: 12, background: '#161b22', borderRadius: 8, border: '1px solid #30363d' }}>
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
                      style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.6)' }}
                      onClick={() => removeImage(idx)}
                    />
                  </div>
                ))}
              </Space>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            {supportsEdit && (
              <Upload
                accept="image/*"
                multiple
                beforeUpload={handleFileSelect}
                showUploadList={false}
              >
                <Button icon={<UploadOutlined />} style={{ background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9' }}>
                  上传图片
                </Button>
              </Upload>
            )}
            <textarea
              ref={promptRef}
              value={imageDemoForm.prompt}
              onChange={(e) => setForm({ prompt: e.target.value })}
              placeholder={supportsEdit && selectedImages.length > 0 ? "描述你想对图片做的修改... (支持粘贴图片 Ctrl+V)" : "输入提示词描述你想要的画面..."}
              disabled={busy}
              rows={2}
              style={{
                flex: 1,
                background: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: 8,
                padding: 12,
                color: '#c9d1d9',
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
                disabled={!selectedNode || !imageDemoForm.prompt.trim()}
                style={{ height: 56, background: '#1f6feb', borderColor: '#1f6feb' }}
              >
                生成
              </Button>
            )}
          </div>
          {busy && (
            <div style={{ marginTop: 8, color: '#8b949e', fontSize: 13 }}>
              {PHASE_TEXT[phase]} {statusText && <span>· {statusText}</span>}
            </div>
          )}
          {error && (
            <div style={{ marginTop: 8, padding: 12, background: '#da3633', color: '#fff', borderRadius: 6, fontSize: 13 }}>
              生成失败：{error}
            </div>
          )}
        </div>

        {/* 底部缩略图栏 */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid #30363d', background: '#161b22', overflowX: 'auto', overflowY: 'hidden' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {imageGallery.map((img) => (
              <div
                key={img.id}
                style={{
                  position: 'relative',
                  width: 80,
                  height: 80,
                  flexShrink: 0,
                  cursor: 'pointer',
                  border: currentImage === img.dataUrl ? '2px solid #58a6ff' : '2px solid transparent',
                  borderRadius: 6,
                  overflow: 'hidden',
                }}
                onClick={() => handleClickImage(img)}
              >
                <img src={img.dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 右侧设置面板 */}
      <div style={{ width: 320, background: '#161b22', borderLeft: '1px solid #30363d', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 16, flex: 1 }}>
          <Typography.Title level={5} style={{ color: '#c9d1d9', marginBottom: 16 }}>参数设置</Typography.Title>

          <div style={{ marginBottom: 16 }}>
            <Typography.Text style={{ color: '#8b949e', fontSize: 12, display: 'block', marginBottom: 4 }}>反向提示词</Typography.Text>
            <textarea
              value={imageDemoForm.negativePrompt ?? ''}
              onChange={(e) => setForm({ negativePrompt: e.target.value })}
              placeholder="描述要避免的内容"
              disabled={busy}
              rows={3}
              style={{
                width: '100%',
                background: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: 6,
                padding: 8,
                color: '#c9d1d9',
                fontSize: 13,
                resize: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {supportsEdit && (
            <div style={{ marginBottom: 16 }}>
              <Typography.Text style={{ color: '#8b949e', fontSize: 12, display: 'block', marginBottom: 4 }}>图片输入方式</Typography.Text>
              <Select
                value={imageDemoForm.imageInputMode || 'base64'}
                onChange={(mode) => setForm({ imageInputMode: mode })}
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
                <Typography.Text style={{ color: '#8b949e', fontSize: 12, display: 'block', marginBottom: 4 }}>采样步数</Typography.Text>
                <input
                  type="number"
                  value={imageDemoForm.steps ?? ''}
                  onChange={(e) => setForm({ steps: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="如 9"
                  disabled={busy}
                  min={1}
                  max={100}
                  style={{
                    width: '100%',
                    background: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: 6,
                    padding: 8,
                    color: '#c9d1d9',
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <Typography.Text style={{ color: '#8b949e', fontSize: 12, display: 'block', marginBottom: 4 }}>引导系数</Typography.Text>
                <input
                  type="number"
                  value={imageDemoForm.guidance ?? ''}
                  onChange={(e) => setForm({ guidance: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="如 4.0"
                  disabled={busy}
                  step={0.5}
                  style={{
                    width: '100%',
                    background: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: 6,
                    padding: 8,
                    color: '#c9d1d9',
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <Typography.Text style={{ color: '#8b949e', fontSize: 12, display: 'block', marginBottom: 4 }}>随机种子</Typography.Text>
                <input
                  type="number"
                  value={imageDemoForm.seed ?? ''}
                  onChange={(e) => setForm({ seed: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="留空=随机"
                  disabled={busy}
                  min={0}
                  style={{
                    width: '100%',
                    background: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: 6,
                    padding: 8,
                    color: '#c9d1d9',
                    fontSize: 13,
                  }}
                />
              </div>
            </>
          )}

          {(debugPayload || debugResponses) && (
            <>
              <Typography.Title level={5} style={{ color: '#c9d1d9', marginTop: 24, marginBottom: 12 }}>调试信息</Typography.Title>
              <div style={{ marginBottom: 12 }}>
                <Typography.Text style={{ color: '#8b949e', fontSize: 11 }}>Payload</Typography.Text>
                <pre style={{
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: 6,
                  padding: 8,
                  fontSize: 11,
                  color: '#c9d1d9',
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
                <Typography.Text style={{ color: '#8b949e', fontSize: 11 }}>Response</Typography.Text>
                <pre style={{
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: 6,
                  padding: 8,
                  fontSize: 11,
                  color: '#c9d1d9',
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
            <Typography.Text style={{ color: '#c9d1d9', fontSize: 14 }}>生成历史 ({imageGallery.length})</Typography.Text>
            {imageGallery.length > 0 && (
              <Popconfirm
                title="清空全部历史？"
                okText="清空"
                okButtonProps={{ danger: true }}
                cancelText="取消"
                onConfirm={() => imageGallery.forEach((i) => deleteImage(i.id))}
              >
                <Button size="small" danger icon={<DeleteOutlined />} style={{ fontSize: 12 }}>
                  清空
                </Button>
              </Popconfirm>
            )}
          </div>
          {imageGallery.length === 0 ? (
            <Typography.Text style={{ color: '#8b949e', fontSize: 12 }}>尚未生成图片</Typography.Text>
          ) : (
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  {imageGallery.slice(0, 10).map((img) => (
                    <div
                      key={img.id}
                      onClick={() => handleClickImage(img)}
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        padding: 8,
                        background: '#0d1117',
                        borderRadius: 6,
                        border: '1px solid #30363d',
                        cursor: 'pointer',
                      }}
                    >
                      <img src={img.dataUrl} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Typography.Text ellipsis style={{ color: '#c9d1d9', fontSize: 12, display: 'block' }}>
                            {img.prompt.slice(0, 30)}...
                          </Typography.Text>
                          {img.imageInputs && img.imageInputs.length > 0 && (
                            <Typography.Text style={{ color: '#58a6ff', fontSize: 10, flexShrink: 0 }}>图生图</Typography.Text>
                          )}
                        </div>
                        <Typography.Text style={{ color: '#8b949e', fontSize: 11 }}>
                          {img.size || '默认'}
                        </Typography.Text>
                      </div>
                      <Space size={4}>
                        <Button
                          size="small"
                          type="text"
                          icon={<DownloadOutlined />}
                          onClick={(e) => { e.stopPropagation(); downloadImage(img.dataUrl, `image-${img.id}`) }}
                          style={{ color: '#8b949e' }}
                        />
                        <Popconfirm
                          title="删除？"
                          okText="删除"
                          okButtonProps={{ danger: true }}
                          cancelText="取消"
                          onConfirm={() => deleteImage(img.id)}
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
