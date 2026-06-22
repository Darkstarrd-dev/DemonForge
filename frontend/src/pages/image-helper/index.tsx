import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import { Button, Input, Slider, Space, Upload, Typography, message, Modal } from 'antd'
import { UploadOutlined, ScissorOutlined, DeleteOutlined, CopyOutlined, BorderOutlined } from '@ant-design/icons'
import GlobalCropPanel from './GlobalCropPanel'
import LayerEditor, { type Layer, type SyncScope } from './LayerEditor'
import { parseGifFile, exportGif } from './gifUtils'
import { exportZip, exportSpriteSheet as exportSprite } from './exportUtils'
import './styles.css'

const { Text } = Typography

interface Slice {
  id: number
  canvas: HTMLCanvasElement
  delay: number
  layers: Layer[]
}

export default function ImageHelperPage() {
  const theme = useAppStore((s) => s.theme)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  const [slices, setSlices] = useState<Slice[]>([])
  const [selectedSliceIdx, setSelectedSliceIdx] = useState(-1)
  const [mode, setMode] = useState<'source' | 'editor' | 'global-crop'>('source')
  const [processedImg, setProcessedImg] = useState<HTMLCanvasElement | null>(null)

  const [cropT, setCropT] = useState(0)
  const [cropB, setCropB] = useState(0)
  const [cropL, setCropL] = useState(0)
  const [cropR, setCropR] = useState(0)
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)

  const [outW, setOutW] = useState(300)
  const [outH, setOutH] = useState(300)
  const [outScale, setOutScale] = useState(1.0)
  const [quality, setQuality] = useState(10)

  const [spriteRows, setSpriteRows] = useState(3)
  const [spriteCols, setSpriteCols] = useState(3)

  const [scale, setScale] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)

  const [enableTrans, setEnableTrans] = useState(false)
  const [keyColor, setKeyColor] = useState('#ffffff')
  const [fuzziness, setFuzziness] = useState(15)
  const [transparencyReady, setTransparencyReady] = useState(false)

  const [selectedLayerId, setSelectedLayerId] = useState<number | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [previewModalVisible, setPreviewModalVisible] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')

  useEffect(() => {
    draw()
  }, [slices, selectedSliceIdx, mode, cropT, cropB, cropL, cropR, rows, cols, processedImg, enableTrans, keyColor, fuzziness])

  const draw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 300, h = 300

    if (mode === 'source' && processedImg) {
      w = processedImg.width
      h = processedImg.height
    } else if (mode === 'editor' && selectedSliceIdx >= 0) {
      const s = slices[selectedSliceIdx]
      if (s) {
        w = s.canvas.width
        h = s.canvas.height
      }
    }

    canvas.width = w
    canvas.height = h
    ctx.clearRect(0, 0, w, h)

    if (mode === 'source' && processedImg) {
      ctx.drawImage(processedImg, 0, 0)
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(0, 0, w, cropT)
      ctx.fillRect(0, h - cropB, w, cropB)
      ctx.fillRect(0, cropT, cropL, h - cropT - cropB)
      ctx.fillRect(w - cropR, cropT, cropR, h - cropT - cropB)
      ctx.strokeStyle = '#ff0055'
      ctx.lineWidth = 2
      ctx.strokeRect(cropL, cropT, w - cropL - cropR, h - cropT - cropB)

      const sw = (w - cropL - cropR) / cols
      const sh = (h - cropT - cropB) / rows
      ctx.strokeStyle = '#00ffaa'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 1; i < cols; i++) {
        ctx.moveTo(cropL + i * sw, cropT)
        ctx.lineTo(cropL + i * sw, h - cropB)
      }
      for (let i = 1; i < rows; i++) {
        ctx.moveTo(cropL, cropT + i * sh)
        ctx.lineTo(w - cropR, cropT + i * sh)
      }
      ctx.stroke()
    } else if (mode === 'editor' && selectedSliceIdx >= 0) {
      const s = slices[selectedSliceIdx]
      if (s) {
        ctx.drawImage(s.canvas, 0, 0)
        s.layers.forEach((l) => {
          ctx.save()
          if (l.type === 'text') {
            let fontStyle = l.italic ? 'italic' : 'normal'
            let fontWeight = l.bold ? 'bold' : 'normal'
            ctx.font = `${fontStyle} ${fontWeight} ${l.size}px sans-serif`
            ctx.fillStyle = l.color || '#ffffff'
            ctx.textBaseline = 'top'
            if (l.underline) {
              const metrics = ctx.measureText(l.content || '')
              ctx.fillText(l.content || '', l.x, l.y)
              ctx.strokeStyle = l.color || '#ffffff'
              ctx.lineWidth = Math.max(1, (l.size || 12) / 12)
              ctx.beginPath()
              ctx.moveTo(l.x, l.y + (l.size || 12) + 2)
              ctx.lineTo(l.x + metrics.width, l.y + (l.size || 12) + 2)
              ctx.stroke()
            } else {
              ctx.fillText(l.content || '', l.x, l.y)
            }
          } else if (l.img) {
            ctx.drawImage(l.img, l.x, l.y, l.w || 0, l.h || 0)
          }
          ctx.restore()
        })
      }
    }
  }

  const applyTransparencyToCtx = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (!enableTrans || !transparencyReady) return
    const d = ctx.getImageData(0, 0, width, height)
    const data = d.data
    const r = parseInt(keyColor.slice(1, 3), 16)
    const g = parseInt(keyColor.slice(3, 5), 16)
    const b = parseInt(keyColor.slice(5, 7), 16)
    const f = fuzziness * 2.55
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue
      if (Math.abs(data[i] - r) <= f && Math.abs(data[i + 1] - g) <= f && Math.abs(data[i + 2] - b) <= f) {
        data[i + 3] = 0
      }
    }
    ctx.putImageData(d, 0, 0)
  }

  const processFile = async (file: File) => {
    // Reset transparency settings
    setEnableTrans(false)
    setTransparencyReady(false)

    // Check if it's a GIF
    if (file.type === 'image/gif') {
      try {
        message.loading('解析 GIF 中...', 0)
        const frames = await parseGifFile(file)
        message.destroy()

        const newSlices: Slice[] = frames.map(frame => ({
          id: Date.now() + Math.random(),
          canvas: frame.canvas,
          delay: frame.delay,
          layers: []
        }))

        setSlices(newSlices)
        setSelectedSliceIdx(0)
        setMode('editor')

        if (newSlices.length > 0) {
          setOutW(newSlices[0].canvas.width)
          setOutH(newSlices[0].canvas.height)
        }

        message.success(`成功加载 ${frames.length} 帧 GIF`)
      } catch (err: any) {
        message.destroy()
        message.error(err.message || 'GIF 解析失败')
      }
      return
    }

    // Handle regular images
    const reader = new FileReader()
    reader.onload = (evt) => {
      const img = new Image()
      img.onload = () => {
        setMode('source')
        setOutW(img.width)
        setOutH(img.height)
        const cvs = document.createElement('canvas')
        cvs.width = img.width
        cvs.height = img.height
        const c = cvs.getContext('2d')
        if (c) {
          c.drawImage(img, 0, 0)
          applyTransparencyToCtx(c, cvs.width, cvs.height)
        }
        setProcessedImg(cvs)
        resetView()
      }
      img.src = evt.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  const handleSlice = () => {
    if (!processedImg) return
    const w = processedImg.width - cropL - cropR
    const h = processedImg.height - cropT - cropB
    const sw = w / cols
    const sh = h / rows
    const newSlices: Slice[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sc = document.createElement('canvas')
        sc.width = sw
        sc.height = sh
        const ctx = sc.getContext('2d')
        if (ctx) {
          ctx.drawImage(processedImg, cropL + c * sw, cropT + r * sh, sw, sh, 0, 0, sw, sh)
        }
        newSlices.push({ id: Date.now() + Math.random(), canvas: sc, delay: 500, layers: [] })
      }
    }
    setSlices(newSlices)
    setOutW(Math.round(sw * outScale))
    setOutH(Math.round(sh * outScale))
    setSelectedSliceIdx(0)
    setMode('editor')
  }

  const resetView = () => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return
    const w = canvas.width || 300
    const h = canvas.height || 300
    const cw = stage.clientWidth
    const ch = stage.clientHeight
    const newScale = Math.min((cw - 40) / w, (ch - 40) / h)
    setScale(newScale)
    setPanX((cw - w * newScale) / 2)
    setPanY((ch - h * newScale) / 2)
  }

  const deleteSlice = (idx: number) => {
    const newSlices = [...slices]
    newSlices.splice(idx, 1)
    setSlices(newSlices)
    setSelectedSliceIdx(Math.max(0, newSlices.length - 1))
  }

  const duplicateSlice = (idx: number) => {
    const src = slices[idx]
    const nc = document.createElement('canvas')
    nc.width = src.canvas.width
    nc.height = src.canvas.height
    const ctx = nc.getContext('2d')
    if (ctx) ctx.drawImage(src.canvas, 0, 0)
    const newSlice: Slice = {
      id: Date.now() + Math.random(),
      canvas: nc,
      delay: src.delay,
      layers: src.layers.map(l => ({ ...l, id: Date.now() + Math.random() }))
    }
    const newSlices = [...slices]
    newSlices.splice(idx + 1, 0, newSlice)
    setSlices(newSlices)
    setSelectedSliceIdx(idx + 1)
  }

  const exportSpriteSheet = () => {
    if (slices.length === 0) {
      message.warning('没有可导出的帧')
      return
    }

    try {
      // Prepare frames with layers rendered
      const framesWithLayers = slices.map(slice => {
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = slice.canvas.width
        tempCanvas.height = slice.canvas.height
        const ctx = tempCanvas.getContext('2d')!

        ctx.drawImage(slice.canvas, 0, 0)

        // Render layers
        slice.layers.forEach(layer => {
          ctx.save()
          if (layer.type === 'text') {
            ctx.font = `${layer.italic ? 'italic' : 'normal'} ${layer.bold ? 'bold' : 'normal'} ${layer.size}px sans-serif`
            ctx.fillStyle = layer.color || '#ffffff'
            ctx.textBaseline = 'top'
            ctx.fillText(layer.content || '', layer.x, layer.y)
            if (layer.underline) {
              const metrics = ctx.measureText(layer.content || '')
              ctx.fillRect(layer.x, layer.y + (layer.size || 12) * 1.05, metrics.width, (layer.size || 12) / 15)
            }
          } else if (layer.img) {
            ctx.drawImage(layer.img, layer.x, layer.y, layer.w || 0, layer.h || 0)
          }
          ctx.restore()
        })

        return { canvas: tempCanvas, delay: slice.delay }
      })

      const dataUrl = exportSprite(framesWithLayers, spriteRows, spriteCols, outW, outH)

      // Download
      const link = document.createElement('a')
      link.download = `SpriteSheet_${Date.now()}.png`
      link.href = dataUrl
      link.click()

      message.success('Sprite Sheet 导出成功')
    } catch (err: any) {
      message.error('导出失败: ' + err.message)
    }
  }

  const handleExportGif = async () => {
    if (slices.length === 0) {
      message.warning('没有可导出的帧')
      return
    }

    try {
      setIsExporting(true)
      setExportProgress(0)

      // Prepare frames with layers rendered
      const framesWithLayers = slices.map(slice => {
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = slice.canvas.width
        tempCanvas.height = slice.canvas.height
        const ctx = tempCanvas.getContext('2d')!

        ctx.drawImage(slice.canvas, 0, 0)

        // Render layers
        slice.layers.forEach(layer => {
          ctx.save()
          if (layer.type === 'text') {
            ctx.font = `${layer.italic ? 'italic' : 'normal'} ${layer.bold ? 'bold' : 'normal'} ${layer.size}px sans-serif`
            ctx.fillStyle = layer.color || '#ffffff'
            ctx.textBaseline = 'top'
            ctx.fillText(layer.content || '', layer.x, layer.y)
            if (layer.underline) {
              const metrics = ctx.measureText(layer.content || '')
              ctx.fillRect(layer.x, layer.y + (layer.size || 12) * 1.05, metrics.width, (layer.size || 12) / 15)
            }
          } else if (layer.img) {
            ctx.drawImage(layer.img, layer.x, layer.y, layer.w || 0, layer.h || 0)
          }
          ctx.restore()
        })

        return { canvas: tempCanvas, delay: slice.delay }
      })

      const blob = await exportGif(
        framesWithLayers,
        outW,
        outH,
        quality,
        enableTrans && transparencyReady,
        (progress) => setExportProgress(Math.round(progress * 100))
      )

      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
      setPreviewModalVisible(true)
      setIsExporting(false)
      message.success('GIF 生成成功')
    } catch (err: any) {
      setIsExporting(false)
      message.error('GIF 导出失败: ' + err.message)
    }
  }

  const handleExportZip = async () => {
    if (slices.length === 0) {
      message.warning('没有可导出的帧')
      return
    }

    try {
      setIsExporting(true)
      setExportProgress(0)

      // Prepare frames with layers rendered
      const framesWithLayers = slices.map(slice => {
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = slice.canvas.width
        tempCanvas.height = slice.canvas.height
        const ctx = tempCanvas.getContext('2d')!

        ctx.drawImage(slice.canvas, 0, 0)

        // Render layers
        slice.layers.forEach(layer => {
          ctx.save()
          if (layer.type === 'text') {
            ctx.font = `${layer.italic ? 'italic' : 'normal'} ${layer.bold ? 'bold' : 'normal'} ${layer.size}px sans-serif`
            ctx.fillStyle = layer.color || '#ffffff'
            ctx.textBaseline = 'top'
            ctx.fillText(layer.content || '', layer.x, layer.y)
            if (layer.underline) {
              const metrics = ctx.measureText(layer.content || '')
              ctx.fillRect(layer.x, layer.y + (layer.size || 12) * 1.05, metrics.width, (layer.size || 12) / 15)
            }
          } else if (layer.img) {
            ctx.drawImage(layer.img, layer.x, layer.y, layer.w || 0, layer.h || 0)
          }
          ctx.restore()
        })

        return { canvas: tempCanvas, delay: slice.delay }
      })

      const blob = await exportZip(
        framesWithLayers,
        outW,
        outH,
        (current, total) => setExportProgress(Math.round((current / total) * 100))
      )

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.download = `Frames_${Date.now()}.zip`
      link.href = url
      link.click()

      setIsExporting(false)
      message.success('ZIP 导出成功')
    } catch (err: any) {
      setIsExporting(false)
      message.error('ZIP 导出失败: ' + err.message)
    }
  }

  const handleLayersChange = (newLayers: Layer[]) => {
    if (selectedSliceIdx < 0 || selectedSliceIdx >= slices.length) return
    const newSlices = [...slices]
    newSlices[selectedSliceIdx].layers = newLayers
    setSlices(newSlices)
  }

  const handleSyncToFrames = (layerId: number, scope: SyncScope, rangeStart?: number, rangeEnd?: number) => {
    if (selectedSliceIdx < 0 || selectedSliceIdx >= slices.length) return

    const sourceLayer = slices[selectedSliceIdx].layers.find((l) => l.id === layerId)
    if (!sourceLayer) return

    const newSlices = [...slices]

    if (scope === 'current') {
      message.success('当前帧无需同步')
      return
    }

    let targetIndices: number[] = []

    if (scope === 'all') {
      targetIndices = slices.map((_, i) => i).filter((i) => i !== selectedSliceIdx)
    } else if (scope === 'range') {
      const start = Math.max(0, rangeStart || 0)
      const end = Math.min(slices.length - 1, rangeEnd || slices.length - 1)
      for (let i = start; i <= end; i++) {
        if (i !== selectedSliceIdx) {
          targetIndices.push(i)
        }
      }
    }

    targetIndices.forEach((idx) => {
      const layerCopy: Layer = {
        ...sourceLayer,
        id: Date.now() + Math.random(),
      }
      if (sourceLayer.img) {
        const img = new Image()
        img.src = sourceLayer.img.src
        layerCopy.img = img
      }
      newSlices[idx].layers.push(layerCopy)
    })

    setSlices(newSlices)
    message.success(`已同步图层到 ${targetIndices.length} 帧`)
  }

  const handleStartGlobalCrop = () => {
    if (slices.length === 0) {
      message.warning('没有可裁剪的帧，请先执行切片')
      return
    }
    setMode('global-crop')
  }

  const handleApplyGlobalCrop = (newSlices: Slice[]) => {
    setSlices(newSlices)
    setSelectedSliceIdx(0)
    setMode('editor')
  }

  const handleCancelGlobalCrop = () => {
    setMode('editor')
  }

  // Show global crop panel if in that mode
  if (mode === 'global-crop') {
    return (
      <div className="image-helper-page" data-theme={theme} style={{ height: 'calc(100vh - 64px)' }}>
        <GlobalCropPanel
          slices={slices}
          onApplyCrop={handleApplyGlobalCrop}
          onCancel={handleCancelGlobalCrop}
        />
      </div>
    )
  }

  return (
    <div className="image-helper-page" data-theme={theme}>
      <div className="workspace">
        <aside className="sidebar">
          <div className="panel-section">
            <div className="group-title">1. 资源导入</div>
            <Upload accept="image/png,image/jpeg,image/gif" beforeUpload={(file) => { processFile(file); return false }} showUploadList={false}>
              <Button icon={<UploadOutlined />} block>选择图片 / GIF</Button>
            </Upload>

            <div style={{ marginTop: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={enableTrans} onChange={(e) => setEnableTrans(e.target.checked)} />
                魔棒透明 (抠图)
              </label>
              {enableTrans && (
                <div style={{ marginTop: 8, padding: 10, background: 'rgba(0,0,0,0.1)', borderRadius: 6 }}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Space>
                      <input type="color" value={keyColor} onChange={(e) => { setKeyColor(e.target.value); setTransparencyReady(true) }} style={{ width: 40, height: 30 }} />
                      <Text type="secondary" style={{ fontSize: 12 }}>选择背景色</Text>
                    </Space>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>容差: {fuzziness}</Text>
                      <Slider min={0} max={100} value={fuzziness} onChange={(v) => { setFuzziness(v); setTransparencyReady(true) }} />
                    </div>
                  </Space>
                </div>
              )}
            </div>

            <div className="group-title" style={{ marginTop: 16 }}>边缘修正</div>
            <Space direction="vertical" style={{ width: '100%', fontSize: 12 }}>
              <div><Text style={{ fontSize: 12 }}>上</Text><Slider value={cropT} max={500} onChange={setCropT} style={{ width: 100, display: 'inline-block', marginLeft: 8 }} /><Input type="number" value={cropT} onChange={(e) => setCropT(+e.target.value)} style={{ width: 50, marginLeft: 8 }} size="small" /></div>
              <div><Text style={{ fontSize: 12 }}>下</Text><Slider value={cropB} max={500} onChange={setCropB} style={{ width: 100, display: 'inline-block', marginLeft: 8 }} /><Input type="number" value={cropB} onChange={(e) => setCropB(+e.target.value)} style={{ width: 50, marginLeft: 8 }} size="small" /></div>
              <div><Text style={{ fontSize: 12 }}>左</Text><Slider value={cropL} max={500} onChange={setCropL} style={{ width: 100, display: 'inline-block', marginLeft: 8 }} /><Input type="number" value={cropL} onChange={(e) => setCropL(+e.target.value)} style={{ width: 50, marginLeft: 8 }} size="small" /></div>
              <div><Text style={{ fontSize: 12 }}>右</Text><Slider value={cropR} max={500} onChange={setCropR} style={{ width: 100, display: 'inline-block', marginLeft: 8 }} /><Input type="number" value={cropR} onChange={(e) => setCropR(+e.target.value)} style={{ width: 50, marginLeft: 8 }} size="small" /></div>
            </Space>

            <div className="group-title" style={{ marginTop: 16 }}>网格切分</div>
            <Space><Input type="number" value={rows} onChange={(e) => setRows(+e.target.value)} placeholder="行" style={{ width: 80 }} /><Input type="number" value={cols} onChange={(e) => setCols(+e.target.value)} placeholder="列" style={{ width: 80 }} /></Space>
            <Button type="primary" icon={<ScissorOutlined />} onClick={handleSlice} block style={{ marginTop: 10 }}>执行切片</Button>
          </div>

          <div className="panel-section" style={{ marginTop: 'auto' }}>
            <div className="group-title">3. 输出设置</div>
            <Space><Input type="number" value={outW} onChange={(e) => setOutW(+e.target.value)} placeholder="宽" style={{ width: 80 }} /><span>×</span><Input type="number" value={outH} onChange={(e) => setOutH(+e.target.value)} placeholder="高" style={{ width: 80 }} /></Space>
            <div style={{ marginTop: 12 }}><Text style={{ fontSize: 12 }}>倍率: {outScale.toFixed(1)}x</Text><Slider min={0.1} max={2.0} step={0.1} value={outScale} onChange={(v) => { setOutScale(v); if (slices.length > 0 && slices[0]) { setOutW(Math.round(slices[0].canvas.width * v)); setOutH(Math.round(slices[0].canvas.height * v)) } }} /></div>
            <div style={{ marginTop: 12 }}><Text style={{ fontSize: 12 }}>GIF 画质: {quality}</Text><Slider min={1} max={10} value={quality} onChange={setQuality} /></div>

            <div className="group-title" style={{ marginTop: 16 }}>Sprite Sheet 布局</div>
            <Space>
              <Input type="number" value={spriteRows} onChange={(e) => setSpriteRows(Math.max(1, +e.target.value))} placeholder="行" style={{ width: 80 }} />
              <span>×</span>
              <Input type="number" value={spriteCols} onChange={(e) => setSpriteCols(Math.max(1, +e.target.value))} placeholder="列" style={{ width: 80 }} />
            </Space>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              将导出 {spriteRows}×{spriteCols} = {spriteRows * spriteCols} 帧 (共 {slices.length} 帧可用)
            </Text>

            <Button type="primary" block style={{ marginTop: 10 }} onClick={handleExportGif} disabled={slices.length === 0} loading={isExporting}>
              {isExporting ? `导出中 ${exportProgress}%` : '👁️ 预览 (导出GIF)'}
            </Button>
            <Button block style={{ marginTop: 10 }} onClick={handleExportZip} disabled={slices.length === 0} loading={isExporting}>
              {isExporting ? `打包中 ${exportProgress}%` : '📦 导出序列帧 (ZIP)'}
            </Button>
            <Button block style={{ marginTop: 10 }} onClick={exportSpriteSheet} disabled={slices.length === 0}>
              🖼️ 导出 Sprite Sheet (PNG)
            </Button>
          </div>
        </aside>

        <div className="stage-area" ref={stageRef}>
          <div className="canvas-wrapper" style={{ transform: `translate(${panX}px, ${panY}px) scale(${scale})` }}>
            <canvas ref={canvasRef}></canvas>
          </div>
          <div className="stage-controls">
            <Button onClick={() => setScale(s => s * 0.8)}>-</Button>
            <Button onClick={resetView}>⟲</Button>
            <Button onClick={() => setScale(s => s * 1.2)}>+</Button>
          </div>
        </div>

        {mode === 'editor' && selectedSliceIdx >= 0 && (
          <aside className="layer-editor-panel">
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
              <Button
                icon={<BorderOutlined />}
                onClick={handleStartGlobalCrop}
                block
                style={{ marginBottom: 12 }}
              >
                全局裁剪 (框选)
              </Button>
            </div>
            <LayerEditor
              layers={slices[selectedSliceIdx]?.layers || []}
              selectedLayerId={selectedLayerId}
              canvasWidth={slices[selectedSliceIdx]?.canvas.width || 300}
              canvasHeight={slices[selectedSliceIdx]?.canvas.height || 300}
              onLayersChange={handleLayersChange}
              onLayerSelect={setSelectedLayerId}
              onSyncToFrames={handleSyncToFrames}
              totalFrames={slices.length}
              currentFrameIndex={selectedSliceIdx}
            />
          </aside>
        )}

        <div className="timeline-area">
          {slices.length === 0 ? (
            <div style={{ color: '#666', margin: 'auto', fontSize: 14 }}>暂无帧序列</div>
          ) : (
            slices.map((s, i) => (
              <div key={s.id} className={`slice-item ${i === selectedSliceIdx ? 'selected' : ''}`} onClick={() => { setSelectedSliceIdx(i); setMode('editor') }}>
                <div className="slice-img-box"><img src={s.canvas.toDataURL()} alt={`frame-${i}`} /></div>
                <div className="slice-tools">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: 11 }}>#{i + 1}</span>
                    <div>
                      <CopyOutlined style={{ cursor: 'pointer', marginRight: 8, fontSize: 12 }} onClick={(e) => { e.stopPropagation(); duplicateSlice(i) }} />
                      <DeleteOutlined style={{ cursor: 'pointer', color: '#ff4d4f', fontSize: 12 }} onClick={(e) => { e.stopPropagation(); deleteSlice(i) }} />
                    </div>
                  </div>
                  <Input type="number" value={s.delay} onChange={(e) => { const newSlices = [...slices]; newSlices[i].delay = +e.target.value; setSlices(newSlices) }} onClick={(e) => e.stopPropagation()} size="small" style={{ marginTop: 4, textAlign: 'center' }} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Preview Modal */}
      <Modal
        open={previewModalVisible}
        onCancel={() => setPreviewModalVisible(false)}
        footer={[
          <Button key="download" type="primary" onClick={() => {
            const link = document.createElement('a')
            link.href = previewUrl
            link.download = `output_${Date.now()}.gif`
            link.click()
          }}>
            ⬇️ 下载 GIF
          </Button>,
          <Button key="close" onClick={() => setPreviewModalVisible(false)}>
            关闭
          </Button>
        ]}
        width={800}
        centered
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <h3>GIF 预览</h3>
          {previewUrl && <img src={previewUrl} alt="GIF Preview" style={{ maxWidth: '100%', border: '1px solid #ddd', marginTop: 16 }} />}
        </div>
      </Modal>
    </div>
  )
}

