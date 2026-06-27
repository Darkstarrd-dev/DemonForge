import { useState, useRef, useEffect } from 'react'
import { Button, Input, Space, ColorPicker, InputNumber, Popconfirm, Radio } from 'antd'
import {
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  DeleteOutlined,
  FontSizeOutlined,
  PictureOutlined,
  DragOutlined,
  CopyOutlined,
  AlignLeftOutlined,
} from '@ant-design/icons'
import type { Color } from 'antd/es/color-picker'

export interface Layer {
  id: number
  type: 'text' | 'image'
  content?: string
  color?: string
  size?: number
  x: number
  y: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  img?: HTMLImageElement
  w?: number
  h?: number
}

export type SyncScope = 'current' | 'all' | 'range'

interface LayerEditorProps {
  layers: Layer[]
  selectedLayerId: number | null
  canvasWidth: number
  canvasHeight: number
  onLayersChange: (layers: Layer[]) => void
  onLayerSelect: (layerId: number | null) => void
  onSyncToFrames: (layerId: number, scope: SyncScope, rangeStart?: number, rangeEnd?: number) => void
  totalFrames: number
  currentFrameIndex: number
}

export default function LayerEditor({
  layers,
  selectedLayerId,
  canvasWidth,
  canvasHeight,
  onLayersChange,
  onLayerSelect,
  onSyncToFrames,
  totalFrames,
  currentFrameIndex,
}: LayerEditorProps) {
  const [syncScope, setSyncScope] = useState<SyncScope>('current')
  const [rangeStart, setRangeStart] = useState(0)
  const [rangeEnd, setRangeEnd] = useState(totalFrames - 1)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 帧数变化时复位区间终点
    setRangeEnd(totalFrames - 1)
  }, [totalFrames])

  const selectedLayer = layers.find((l) => l.id === selectedLayerId)

  const addTextLayer = () => {
    const newLayer: Layer = {
      id: Date.now(),
      type: 'text',
      content: '新文本',
      color: '#ffffff',
      size: 24,
      x: canvasWidth / 2 - 50,
      y: canvasHeight / 2 - 12,
      bold: false,
      italic: false,
      underline: false,
    }
    onLayersChange([...layers, newLayer])
    onLayerSelect(newLayer.id)
  }

  const addImageLayer = () => {
    fileInputRef.current?.click()
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      const img = new Image()
      img.onload = () => {
        const newLayer: Layer = {
          id: Date.now(),
          type: 'image',
          x: canvasWidth / 2 - img.width / 2,
          y: canvasHeight / 2 - img.height / 2,
          img,
          w: img.width,
          h: img.height,
        }
        onLayersChange([...layers, newLayer])
        onLayerSelect(newLayer.id)
      }
      img.src = evt.target?.result as string
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const updateLayer = (id: number, updates: Partial<Layer>) => {
    const newLayers = layers.map((l) => (l.id === id ? { ...l, ...updates } : l))
    onLayersChange(newLayers)
  }

  const deleteLayer = (id: number) => {
    onLayersChange(layers.filter((l) => l.id !== id))
    if (selectedLayerId === id) {
      onLayerSelect(null)
    }
  }

  const duplicateLayer = (layer: Layer) => {
    const newLayer: Layer = {
      ...layer,
      // eslint-disable-next-line react-hooks/purity -- 事件处理器内生成唯一 id（复制图层），非渲染期
      id: Date.now(),
      x: layer.x + 10,
      y: layer.y + 10,
    }
    if (layer.img) {
      const img = new Image()
      img.src = layer.img.src
      newLayer.img = img
    }
    onLayersChange([...layers, newLayer])
    onLayerSelect(newLayer.id)
  }

  const moveLayerUp = (index: number) => {
    if (index >= layers.length - 1) return
    const newLayers = [...layers]
    ;[newLayers[index], newLayers[index + 1]] = [newLayers[index + 1], newLayers[index]]
    onLayersChange(newLayers)
  }

  const moveLayerDown = (index: number) => {
    if (index <= 0) return
    const newLayers = [...layers]
    ;[newLayers[index], newLayers[index - 1]] = [newLayers[index - 1], newLayers[index]]
    onLayersChange(newLayers)
  }

  const handleSyncClick = () => {
    if (!selectedLayerId) return
    onSyncToFrames(selectedLayerId, syncScope, rangeStart, rangeEnd)
  }

  return (
    <div style={{ padding: '12px', background: 'rgba(0,0,0,0.05)', borderRadius: 6, height: '100%', overflow: 'auto' }}>
      <div className="group-title" style={{ marginBottom: 12 }}>图层编辑</div>

      {/* Add Layer Buttons */}
      <Space style={{ marginBottom: 12, width: '100%' }} direction="vertical">
        <Button icon={<FontSizeOutlined />} onClick={addTextLayer} block size="small">
          添加文本图层
        </Button>
        <Button icon={<PictureOutlined />} onClick={addImageLayer} block size="small">
          添加图片图层
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageUpload}
        />
      </Space>

      {/* Layer List */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 8, color: '#666' }}>图层列表 (从上到下)</div>
        {layers.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#999', fontSize: 12 }}>暂无图层</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...layers].reverse().map((layer, reverseIndex) => {
              const index = layers.length - 1 - reverseIndex
              const isSelected = layer.id === selectedLayerId
              return (
                <div
                  key={layer.id}
                  onClick={() => onLayerSelect(layer.id)}
                  style={{
                    padding: '8px 10px',
                    background: isSelected ? 'rgba(24, 144, 255, 0.15)' : 'rgba(255,255,255,0.6)',
                    border: isSelected ? '2px solid #1890ff' : '1px solid rgba(0,0,0,0.1)',
                    borderRadius: 4,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 12,
                  }}
                >
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <DragOutlined style={{ color: '#999', cursor: 'move' }} />
                    {layer.type === 'text' ? (
                      <span>
                        📝 {layer.content?.substring(0, 10) || '(空文本)'}
                        {(layer.content?.length || 0) > 10 ? '...' : ''}
                      </span>
                    ) : (
                      <span>🖼️ 图片 ({layer.w}×{layer.h})</span>
                    )}
                  </div>
                  <Space size={4}>
                    <Button
                      size="small"
                      type="text"
                      icon={<CopyOutlined />}
                      onClick={(e) => {
                        e.stopPropagation()
                        duplicateLayer(layer)
                      }}
                      style={{ padding: '0 4px', height: 20 }}
                    />
                    <Button
                      size="small"
                      type="text"
                      onClick={(e) => {
                        e.stopPropagation()
                        moveLayerUp(index)
                      }}
                      disabled={index >= layers.length - 1}
                      style={{ padding: '0 4px', height: 20, fontSize: 10 }}
                    >
                      ▲
                    </Button>
                    <Button
                      size="small"
                      type="text"
                      onClick={(e) => {
                        e.stopPropagation()
                        moveLayerDown(index)
                      }}
                      disabled={index <= 0}
                      style={{ padding: '0 4px', height: 20, fontSize: 10 }}
                    >
                      ▼
                    </Button>
                    <Popconfirm
                      title="确定删除此图层？"
                      onConfirm={(e) => {
                        e?.stopPropagation()
                        deleteLayer(layer.id)
                      }}
                      okText="删除"
                      cancelText="取消"
                    >
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => e.stopPropagation()}
                        style={{ padding: '0 4px', height: 20 }}
                      />
                    </Popconfirm>
                  </Space>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Layer Properties */}
      {selectedLayer && (
        <div style={{ marginTop: 16, padding: 12, background: 'rgba(255,255,255,0.8)', borderRadius: 6, border: '1px solid rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 12, color: '#333' }}>
            图层属性 (ID: {selectedLayer.id})
          </div>

          <Space direction="vertical" style={{ width: '100%' }} size="small">
            {/* Position */}
            <div>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>位置</div>
              <Space size="small">
                <InputNumber
                  size="small"
                  value={selectedLayer.x}
                  onChange={(v) => updateLayer(selectedLayer.id, { x: v || 0 })}
                  addonBefore="X"
                  style={{ width: 90 }}
                />
                <InputNumber
                  size="small"
                  value={selectedLayer.y}
                  onChange={(v) => updateLayer(selectedLayer.id, { y: v || 0 })}
                  addonBefore="Y"
                  style={{ width: 90 }}
                />
              </Space>
            </div>

            {selectedLayer.type === 'text' && (
              <>
                {/* Text Content */}
                <div>
                  <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>文本内容</div>
                  <Input.TextArea
                    size="small"
                    value={selectedLayer.content}
                    onChange={(e) => updateLayer(selectedLayer.id, { content: e.target.value })}
                    rows={3}
                    placeholder="输入文本..."
                  />
                </div>

                {/* Text Style */}
                <div>
                  <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>文本样式</div>
                  <Space size="small" wrap>
                    <Button
                      size="small"
                      type={selectedLayer.bold ? 'primary' : 'default'}
                      icon={<BoldOutlined />}
                      onClick={() => updateLayer(selectedLayer.id, { bold: !selectedLayer.bold })}
                    />
                    <Button
                      size="small"
                      type={selectedLayer.italic ? 'primary' : 'default'}
                      icon={<ItalicOutlined />}
                      onClick={() => updateLayer(selectedLayer.id, { italic: !selectedLayer.italic })}
                    />
                    <Button
                      size="small"
                      type={selectedLayer.underline ? 'primary' : 'default'}
                      icon={<UnderlineOutlined />}
                      onClick={() => updateLayer(selectedLayer.id, { underline: !selectedLayer.underline })}
                    />
                  </Space>
                </div>

                {/* Font Size */}
                <div>
                  <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>字号: {selectedLayer.size}px</div>
                  <InputNumber
                    size="small"
                    min={8}
                    max={200}
                    value={selectedLayer.size}
                    onChange={(v) => updateLayer(selectedLayer.id, { size: v || 12 })}
                    style={{ width: '100%' }}
                  />
                </div>

                {/* Text Color */}
                <div>
                  <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>文本颜色</div>
                  <ColorPicker
                    value={selectedLayer.color}
                    onChange={(color: Color) => updateLayer(selectedLayer.id, { color: color.toHexString() })}
                    showText
                    size="small"
                    style={{ width: '100%' }}
                  />
                </div>
              </>
            )}

            {selectedLayer.type === 'image' && (
              <>
                {/* Image Size */}
                <div>
                  <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>图片尺寸</div>
                  <Space size="small">
                    <InputNumber
                      size="small"
                      value={selectedLayer.w}
                      onChange={(v) => updateLayer(selectedLayer.id, { w: v || 0 })}
                      addonBefore="W"
                      style={{ width: 90 }}
                    />
                    <InputNumber
                      size="small"
                      value={selectedLayer.h}
                      onChange={(v) => updateLayer(selectedLayer.id, { h: v || 0 })}
                      addonBefore="H"
                      style={{ width: 90 }}
                    />
                  </Space>
                </div>
              </>
            )}
          </Space>
        </div>
      )}

      {/* Sync to Frames */}
      {selectedLayer && totalFrames > 1 && (
        <div style={{ marginTop: 16, padding: 12, background: 'rgba(255, 230, 200, 0.3)', borderRadius: 6, border: '1px solid rgba(200, 150, 100, 0.3)' }}>
          <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 12, color: '#333' }}>同步到其他帧</div>

          <Radio.Group
            value={syncScope}
            onChange={(e) => setSyncScope(e.target.value)}
            style={{ width: '100%', marginBottom: 12 }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Radio value="current" style={{ fontSize: 12 }}>
                仅当前帧 (#{currentFrameIndex + 1})
              </Radio>
              <Radio value="all" style={{ fontSize: 12 }}>
                全部帧 (共 {totalFrames} 帧)
              </Radio>
              <Radio value="range" style={{ fontSize: 12 }}>
                指定范围
              </Radio>
            </Space>
          </Radio.Group>

          {syncScope === 'range' && (
            <Space size="small" style={{ marginBottom: 12, width: '100%' }}>
              <InputNumber
                size="small"
                min={0}
                max={totalFrames - 1}
                value={rangeStart}
                onChange={(v) => setRangeStart(v || 0)}
                addonBefore="从"
                style={{ width: 90 }}
              />
              <InputNumber
                size="small"
                min={0}
                max={totalFrames - 1}
                value={rangeEnd}
                onChange={(v) => setRangeEnd(v || 0)}
                addonBefore="到"
                style={{ width: 90 }}
              />
            </Space>
          )}

          <Button
            type="primary"
            size="small"
            block
            onClick={handleSyncClick}
            icon={<AlignLeftOutlined />}
          >
            应用同步
          </Button>

          <div style={{ fontSize: 11, color: '#666', marginTop: 8, lineHeight: 1.4 }}>
            ⚠️ 将覆盖目标帧中相同位置的图层
          </div>
        </div>
      )}
    </div>
  )
}
