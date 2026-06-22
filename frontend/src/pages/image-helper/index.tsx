import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import { Button, Input, Slider, Space, Upload, Typography } from 'antd'
import { UploadOutlined, ScissorOutlined, DeleteOutlined, CopyOutlined } from '@ant-design/icons'
import './styles.css'

const { Text } = Typography

interface Layer {
  id: number
  type: 'text' | 'image'
  content?: string
  color?: string
  size?: number
  x: number
  y: number
  bold?: boolean
  italic?: boolean
  img?: HTMLImageElement
  w?: number
  h?: number
}

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
  const [mode, setMode] = useState<'source' | 'editor'>('source')
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

  const [scale, setScale] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)

  const [enableTrans, setEnableTrans] = useState(false)
  const [keyColor, setKeyColor] = useState('#ffffff')
  const [fuzziness, setFuzziness] = useState(15)
  const [transparencyReady, setTransparencyReady] = useState(false)

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
            ctx.font = `${l.bold ? 'bold' : 'normal'} ${l.size}px sans-serif`
            ctx.fillStyle = l.color || '#ffffff'
            ctx.textBaseline = 'top'
            ctx.fillText(l.content || '', l.x, l.y)
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

  const processFile = (file: File) => {
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
            <Button type="primary" block style={{ marginTop: 10 }}>👁️ 预览 (导出GIF)</Button>
            <Button block style={{ marginTop: 10 }}>📦 导出序列帧 (ZIP)</Button>
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
    </div>
  )
}

