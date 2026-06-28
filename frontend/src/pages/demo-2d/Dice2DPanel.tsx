import { useState } from 'react'
import { Button, Space, Slider, Input, Select, Typography } from 'antd'
import type { Dice2DMode, DiceSideValue } from '../../game/dice'

const { Text } = Typography

const SIDES_OPTIONS_2D: { value: DiceSideValue; label: string; disabled?: boolean }[] = [
  { value: 6, label: 'd6' },
  { value: 8, label: 'd8（暂不支持 2D）', disabled: true },
  { value: 10, label: 'd10（暂不支持 2D）', disabled: true },
  { value: 12, label: 'd12（暂不支持 2D）', disabled: true },
  { value: 20, label: 'd20（暂不支持 2D）', disabled: true },
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
}

export default function Dice2DPanel({ mode, count, sides, onCountChange, onSidesChange, onRoll, rolling, lastResult }: Props) {
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
          <Slider min={1} max={6} value={count} onChange={onCountChange} style={{ margin: '4px 0' }} />
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
