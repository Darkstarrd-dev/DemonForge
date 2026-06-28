import { useState } from 'react'
import { Button, Space, Slider, InputNumber, Typography } from 'antd'
import type { Dice2DMode } from '../../game/dice'

const { Text } = Typography

interface Props {
  mode: Dice2DMode
  onRoll: (presetValues?: number[]) => void
  rolling: boolean
  lastResult?: { values: number[]; total: number }
}

export default function Dice2DPanel({ mode, onRoll, rolling, lastResult }: Props) {
  const [count, setCount] = useState(2)
  const [presetInput, setPresetInput] = useState('')

  const handleRoll = () => {
    const preset = presetInput.trim()
    if (preset) {
      const values = preset.split(',').map(Number)
      if (values.every((v) => !isNaN(v) && v >= 1 && v <= 6)) {
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
          <Slider
            min={1}
            max={6}
            value={count}
            onChange={setCount}
            style={{ margin: '4px 0' }}
          />
        </div>
        <div>
          <Text style={{ fontSize: 11, color: '#666' }}>预设结果（逗号分隔，留空=随机）</Text>
          <InputNumber
            size="small"
            style={{ width: '100%' }}
            placeholder="如: 3,5"
            value={presetInput as unknown as number}
            onChange={(v) => setPresetInput(v ? String(v) : '')}
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