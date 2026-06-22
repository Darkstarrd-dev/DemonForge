import { useState, useRef, useEffect } from 'react'
import { Button, Input, Slider, Space, Typography, message } from 'antd'
import { CloseOutlined, CheckOutlined } from '@ant-design/icons'

const { Text } = Typography

interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

interface Slice {
  id: number
  canvas: HTMLCanvasElement
  delay: number
  layers: any[]
}

interface GlobalCropPanelProps {
  slices: Slice[]
  onApplyCrop: (newSlices: Slice[]) => void
  onCancel: () => void
}

export default function GlobalCropPanel({ slices, onApplyCrop, onCancel }: GlobalCropPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  const [cropRect, setCropRect] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)

  // Preview the first frame
  const previewSlice = slices[0] || null

  useEffect(() => {
    if (previewSlice) {
      // Initialize crop rect to full image
      setCropRect({
        x: 0,
        y: 0,
        w: previewSlice.canvas.width,
        h: previewSlice.canvas.height
      })
      resetView()
    }
  }, [previewSlice])

  useEffect(() => {
    draw()
  }, [cropRect, previewSlice])

  const draw = () => {
    const canvas = canvasRef.current
    if (!canvas || !previewSlice) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = previewSlice.canvas.width
    const h = previewSlice.canvas.height

    canvas.width = w
    canvas.height = h
    ctx.clearRect(0, 0, w, h)

    // Draw the preview image
    ctx.drawImage(previewSlice.canvas, 0, 0)

    // Draw overlay (darken areas outside crop rect)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'

    // Top area
    ctx.fillRect(0, 0, w, cropRect.y)

    // Bottom area
    ctx.fillRect(0, cropRect.y + cropRect.h, w, h - cropRect.y - cropRect.h)

    // Left area
    ctx.fillRect(0, cropRect.y, cropRect.x, cropRect.h)

    // Right area
    ctx.fillRect(cropRect.x + cropRect.w, cropRect.y, w - cropRect.x - cropRect.w, cropRect.h)

    // Draw crop rect border
    ctx.strokeStyle = '#ff6b35'
    ctx.lineWidth = 2
    ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h)

    // Draw corner handles
    const handleSize = 10
    ctx.fillStyle = '#ff6b35'
    const corners = [
      { x: cropRect.x, y: cropRect.y },
      { x: cropRect.x + cropRect.w, y: cropRect.y },
      { x: cropRect.x, y: cropRect.y + cropRect.h },
      { x: cropRect.x + cropRect.w, y: cropRect.y + cropRect.h }
    ]

    corners.forEach(corner => {
      ctx.fillRect(corner.x - handleSize / 2, corner.y - handleSize / 2, handleSize, handleSize)
    })

    // Draw edge handles (midpoints)
    ctx.fillStyle = '#ff6b35'
    const edges = [
      { x: cropRect.x + cropRect.w / 2, y: cropRect.y },
      { x: cropRect.x + cropRect.w / 2, y: cropRect.y + cropRect.h },
      { x: cropRect.x, y: cropRect.y + cropRect.h / 2 },
      { x: cropRect.x + cropRect.w, y: cropRect.y + cropRect.h / 2 }
    ]

    edges.forEach(edge => {
      ctx.fillRect(edge.x - handleSize / 2, edge.y - handleSize / 2, handleSize, handleSize)
    })
  }

  const resetView = () => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage || !previewSlice) return

    const w = previewSlice.canvas.width
    const h = previewSlice.canvas.height
    const cw = stage.clientWidth
    const ch = stage.clientHeight
    const newScale = Math.min((cw - 40) / w, (ch - 40) / h)
    setScale(newScale)
    setPanX((cw - w * newScale) / 2)
    setPanY((ch - h * newScale) / 2)
  }

  const getCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const x = (clientX - rect.left) / scale
    const y = (clientY - rect.top) / scale

    return { x, y }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e.clientX, e.clientY)
    setIsDragging(true)
    setDragStart(coords)
    setCropRect({ x: coords.x, y: coords.y, w: 0, h: 0 })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return

    const coords = getCanvasCoords(e.clientX, e.clientY)
    const x = Math.min(dragStart.x, coords.x)
    const y = Math.min(dragStart.y, coords.y)
    const w = Math.abs(coords.x - dragStart.x)
    const h = Math.abs(coords.y - dragStart.y)

    setCropRect({ x, y, w, h })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleApplyCrop = () => {
    if (!previewSlice || cropRect.w <= 0 || cropRect.h <= 0) {
      message.error('裁剪区域无效')
      return
    }

    const newSlices: Slice[] = slices.map(slice => {
      const newCanvas = document.createElement('canvas')
      newCanvas.width = cropRect.w
      newCanvas.height = cropRect.h
      const ctx = newCanvas.getContext('2d')

      if (ctx) {
        // Draw cropped portion
        ctx.drawImage(
          slice.canvas,
          cropRect.x, cropRect.y, cropRect.w, cropRect.h,
          0, 0, cropRect.w, cropRect.h
        )

        // Adjust layer positions
        const adjustedLayers = slice.layers.map(layer => ({
          ...layer,
          x: layer.x - cropRect.x,
          y: layer.y - cropRect.y
        })).filter(layer => {
          // Filter out layers that are completely outside the crop area
          return layer.x + (layer.w || 0) > 0 &&
                 layer.x < cropRect.w &&
                 layer.y + (layer.h || 0) > 0 &&
                 layer.y < cropRect.h
        })

        return {
          id: Date.now() + Math.random(),
          canvas: newCanvas,
          delay: slice.delay,
          layers: adjustedLayers
        }
      }

      return slice
    })

    onApplyCrop(newSlices)
    message.success(`已对 ${slices.length} 帧应用裁剪`)
  }

  if (!previewSlice) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#666'
      }}>
        没有可裁剪的帧
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--stage-bg)' }}>
      {/* Left control panel */}
      <div style={{
        width: 280,
        padding: 16,
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        overflowY: 'auto'
      }}>
        <div>
          <Text strong style={{ fontSize: 16, color: 'var(--text-primary)' }}>全局裁剪</Text>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
            在画布上拖拽选择裁剪区域，将应用到所有 {slices.length} 帧
          </div>
        </div>

        <div style={{
          padding: 12,
          background: 'var(--panel-bg)',
          borderRadius: 8,
          border: '1px solid var(--border-color)'
        }}>
          <Text style={{ fontSize: 13, color: 'var(--text-primary)' }}>裁剪区域</Text>

          <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size="small">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12, width: 30, color: 'var(--text-secondary)' }}>X</Text>
              <Slider
                value={cropRect.x}
                max={previewSlice.canvas.width - cropRect.w}
                onChange={(v) => setCropRect({ ...cropRect, x: v })}
                style={{ flex: 1 }}
              />
              <Input
                type="number"
                value={cropRect.x}
                onChange={(e) => setCropRect({ ...cropRect, x: Math.max(0, +e.target.value) })}
                style={{ width: 60 }}
                size="small"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12, width: 30, color: 'var(--text-secondary)' }}>Y</Text>
              <Slider
                value={cropRect.y}
                max={previewSlice.canvas.height - cropRect.h}
                onChange={(v) => setCropRect({ ...cropRect, y: v })}
                style={{ flex: 1 }}
              />
              <Input
                type="number"
                value={cropRect.y}
                onChange={(e) => setCropRect({ ...cropRect, y: Math.max(0, +e.target.value) })}
                style={{ width: 60 }}
                size="small"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12, width: 30, color: 'var(--text-secondary)' }}>宽</Text>
              <Slider
                value={cropRect.w}
                max={previewSlice.canvas.width - cropRect.x}
                onChange={(v) => setCropRect({ ...cropRect, w: v })}
                style={{ flex: 1 }}
              />
              <Input
                type="number"
                value={cropRect.w}
                onChange={(e) => setCropRect({ ...cropRect, w: Math.max(1, +e.target.value) })}
                style={{ width: 60 }}
                size="small"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 12, width: 30, color: 'var(--text-secondary)' }}>高</Text>
              <Slider
                value={cropRect.h}
                max={previewSlice.canvas.height - cropRect.y}
                onChange={(v) => setCropRect({ ...cropRect, h: v })}
                style={{ flex: 1 }}
              />
              <Input
                type="number"
                value={cropRect.h}
                onChange={(e) => setCropRect({ ...cropRect, h: Math.max(1, +e.target.value) })}
                style={{ width: 60 }}
                size="small"
              />
            </div>
          </Space>

          <div style={{
            marginTop: 12,
            padding: 8,
            background: 'var(--info-bg)',
            borderRadius: 4,
            fontSize: 11,
            color: 'var(--text-secondary)'
          }}>
            原始尺寸: {previewSlice.canvas.width} × {previewSlice.canvas.height}<br/>
            裁剪后: {cropRect.w} × {cropRect.h}
          </div>
        </div>

        <div style={{ marginTop: 'auto' }}>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            block
            size="large"
            onClick={handleApplyCrop}
            disabled={cropRect.w <= 0 || cropRect.h <= 0}
          >
            确认裁剪
          </Button>

          <Button
            icon={<CloseOutlined />}
            block
            size="large"
            onClick={onCancel}
            style={{ marginTop: 8 }}
          >
            取消
          </Button>
        </div>
      </div>

      {/* Center stage area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }} ref={stageRef}>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%) translate(${panX}px, ${panY}px) scale(${scale})`,
            transformOrigin: '0 0',
            cursor: 'crosshair'
          }}
        >
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>

        {/* Stage controls */}
        <div style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 8,
          background: 'rgba(0, 0, 0, 0.7)',
          padding: '8px 12px',
          borderRadius: 8
        }}>
          <Button onClick={() => setScale(s => Math.max(0.1, s * 0.8))} size="small">-</Button>
          <Button onClick={resetView} size="small">⟲</Button>
          <Button onClick={() => setScale(s => Math.min(10, s * 1.2))} size="small">+</Button>
          <Text style={{ color: '#fff', fontSize: 12, marginLeft: 8 }}>
            {(scale * 100).toFixed(0)}%
          </Text>
        </div>

        {/* Instructions */}
        <div style={{
          position: 'absolute',
          top: 20,
          left: 20,
          background: 'rgba(0, 0, 0, 0.8)',
          color: '#fff',
          padding: '12px 16px',
          borderRadius: 8,
          fontSize: 12,
          maxWidth: 300
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>操作说明：</div>
          <div>• 在画布上拖拽鼠标绘制裁剪框</div>
          <div>• 使用左侧滑块微调裁剪区域</div>
          <div>• 橙色框内区域将被保留</div>
          <div>• 确认后将应用到所有帧</div>
        </div>
      </div>
    </div>
  )
}
