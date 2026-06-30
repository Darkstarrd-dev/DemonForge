import { useState } from 'react'
import { Button, Space, Slider, Input, Select, Typography } from 'antd'
import type { Dice2DMode, Dice2DLayout, DiceSideValue } from '../../game/dice'

const { Text } = Typography

const SIDES_OPTIONS_2D: { value: DiceSideValue; label: string; disabled?: boolean }[] = [
  { value: 6, label: 'd6' },
  { value: 8, label: 'd8（暂不支持 2D）', disabled: true },
  { value: 10, label: 'd10（暂不支持 2D）', disabled: true },
  { value: 12, label: 'd12（暂不支持 2D）', disabled: true },
  { value: 20, label: 'd20（暂不支持 2D）', disabled: true },
]

const LAYOUT_OPTIONS: { value: Dice2DLayout; label: string }[] = [
  { value: 'horizontal', label: '横排' },
  { value: 'grid', label: '网格' },
  { value: 'scatter', label: '散布' },
]

interface Props {
  mode: Dice2DMode
  count: number
  sides: DiceSideValue
  onCountChange: (v: number) => void
  onSidesChange: (v: DiceSideValue) => void
  onRoll: (presetValues?: number[]) => void
  rolling: boolean
  lastResult?: { values: number[]; total: number }
  size: number
  spacing: number
  layout: Dice2DLayout
  onSizeChange: (v: number) => void
  onSpacingChange: (v: number) => void
  onLayoutChange: (v: Dice2DLayout) => void
  throwStrength: number
  spinStrength: number
  onThrowStrengthChange: (v: number) => void
  onSpinStrengthChange: (v: number) => void
  simSpeed: number
  onSimSpeedChange: (v: number) => void
}

export default function Dice2DPanel({
  mode, count, sides, onCountChange, onSidesChange, onRoll, rolling, lastResult,
  size, spacing, layout, onSizeChange, onSpacingChange, onLayoutChange,
  throwStrength, spinStrength, onThrowStrengthChange, onSpinStrengthChange,
  simSpeed, onSimSpeedChange,
}: Props) {
  const [presetInput, setPresetInput] = useState('')

  const handleRoll = () => {
    const preset = presetInput.trim()
    if (preset) {
      const values = preset.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n))
      if (values.length === count && values.every((v) => v >= 1 && v <= sides)) {
        onRoll(values)
        return
      }
    }
    onRoll()
  }

  return (
    <div style={{ width: 160 }}>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Text strong style={{ fontSize: 12, color: '#333' }}>
          {mode === 'sprite' ? '帧动画模式' : '物理刚体模式'}
        </Text>
        <div>
          <Text style={{ fontSize: 11, color: '#666' }}>骰子数量</Text>
          <Slider min={1} max={6} value={count} onChange={onCountChange} disabled={rolling} style={{ margin: '4px 0' }} />
        </div>
        <div>
          <Text style={{ fontSize: 11, color: '#666' }}>面数</Text>
          <Select
            value={sides}
            onChange={(v) => onSidesChange(v as DiceSideValue)}
            style={{ width: '100%' }}
            options={SIDES_OPTIONS_2D}
            size="small"
          />
        </div>

        {mode === 'sprite' && (
          <>
            <div>
              <Text style={{ fontSize: 11, color: '#666' }}>大小 {size.toFixed(1)}</Text>
              <Slider min={0.5} max={4} step={0.1} value={size} onChange={onSizeChange} style={{ margin: '4px 0' }} />
            </div>
            <div>
              <Text style={{ fontSize: 11, color: '#666' }}>间隔 {spacing}px</Text>
              <Slider min={40} max={200} step={5} value={spacing} onChange={onSpacingChange} style={{ margin: '4px 0' }} />
            </div>
            <div>
              <Text style={{ fontSize: 11, color: '#666' }}>排列</Text>
              <Select
                value={layout}
                onChange={(v) => onLayoutChange(v as Dice2DLayout)}
                style={{ width: '100%' }}
                options={LAYOUT_OPTIONS}
                size="small"
              />
            </div>
          </>
        )}

        {mode === 'matter' && (
          <>
            <div>
              <Text style={{ fontSize: 11, color: '#666' }}>投掷强度 {throwStrength.toFixed(1)}</Text>
              <Slider min={0} max={40} step={0.5} value={throwStrength} onChange={onThrowStrengthChange} style={{ margin: '4px 0' }} />
            </div>
            <div>
              <Text style={{ fontSize: 11, color: '#666' }}>旋转强度 {spinStrength.toFixed(1)}</Text>
              <Slider min={0} max={40} step={0.5} value={spinStrength} onChange={onSpinStrengthChange} style={{ margin: '4px 0' }} />
            </div>
            <div>
              <Text style={{ fontSize: 11, color: '#666' }}>模拟速度 {simSpeed.toFixed(1)}x</Text>
              <Slider min={0.1} max={3.0} step={0.1} value={simSpeed} onChange={onSimSpeedChange} style={{ margin: '4px 0' }} />
            </div>
          </>
        )}

        <div>
          <Text style={{ fontSize: 11, color: '#666' }}>预设结果（逗号分隔，留空=随机）</Text>
          <Input
            size="small"
            style={{ width: '100%' }}
            placeholder="如: 3,5"
            value={presetInput}
            onChange={(e) => setPresetInput(e.target.value)}
          />
        </div>
        <Button type="primary" block onClick={handleRoll} loading={rolling}>
          投掷
        </Button>
        {lastResult && (
          <div style={{ textAlign: 'center', fontSize: 12 }}>
            <Text type="secondary">
              [{lastResult.values.join(', ')}] = {lastResult.total}
            </Text>
          </div>
        )}
      </Space>
    </div>
  )
}
