import { useState } from 'react'
import { Input, Select, Slider, Space, Typography, Button, Collapse } from 'antd'
import type { DiceSideValue, DiceThemeColors, DicePhysicsParams } from '../../game/dice'

const { Text } = Typography

const SIDES_OPTIONS: { value: DiceSideValue; label: string }[] = [
  { value: 6, label: 'd6' },
  { value: 8, label: 'd8' },
  { value: 10, label: 'd10' },
  { value: 12, label: 'd12' },
  { value: 20, label: 'd20' },
]

interface Props {
  count: number
  sides: DiceSideValue
  theme: DiceThemeColors
  physics: DicePhysicsParams
  onCountChange: (v: number) => void
  onSidesChange: (v: DiceSideValue) => void
  onThemeChange: (v: DiceThemeColors) => void
  onPhysicsChange: (v: DicePhysicsParams) => void
  onRoll: (presetValues?: number[]) => void
  rolling: boolean
  lastResult?: { values: number[]; total: number }
}

export default function Dice3DPanel({
  count, sides, theme, physics,
  onCountChange, onSidesChange, onThemeChange, onPhysicsChange,
  onRoll, rolling, lastResult,
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

  const updatePhysics = (key: keyof DicePhysicsParams, val: number) => {
    onPhysicsChange({ ...physics, [key]: val })
  }

  return (
    <div style={{ width: 180 }}>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Text strong style={{ fontSize: 12, color: '#333' }}>3D 骰子演示</Text>
        <div>
          <Text style={{ fontSize: 11, color: '#666' }}>骰子数量</Text>
          <Slider min={1} max={6} value={count} onChange={onCountChange} style={{ margin: '4px 0' }} />
        </div>
        <div>
          <Text style={{ fontSize: 11, color: '#666' }}>面数</Text>
          <Select
            value={sides}
            onChange={onSidesChange}
            style={{ width: '100%' }}
            options={SIDES_OPTIONS}
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
        <Collapse
          size="small"
          items={[
            {
              key: 'theme',
              label: '外观',
              children: (
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <div><Text style={{ fontSize: 11 }}>底色</Text><Input size="small" value={theme.face} onChange={(e) => onThemeChange({ ...theme, face: e.target.value })} /></div>
                  <div><Text style={{ fontSize: 11 }}>点色</Text><Input size="small" value={theme.pip} onChange={(e) => onThemeChange({ ...theme, pip: e.target.value })} /></div>
                  <div><Text style={{ fontSize: 11 }}>边色</Text><Input size="small" value={theme.edge} onChange={(e) => onThemeChange({ ...theme, edge: e.target.value })} /></div>
                </Space>
              ),
            },
            {
              key: 'physics',
              label: '物理参数',
              children: (
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <div><Text style={{ fontSize: 11 }}>摩擦力 {physics.friction.toFixed(2)}</Text><Slider min={0} max={1} step={0.05} value={physics.friction} onChange={(v) => updatePhysics('friction', v)} /></div>
                  <div><Text style={{ fontSize: 11 }}>弹性 {physics.restitution.toFixed(2)}</Text><Slider min={0} max={1} step={0.05} value={physics.restitution} onChange={(v) => updatePhysics('restitution', v)} /></div>
                  <div><Text style={{ fontSize: 11 }}>投掷力 {physics.throwForce}</Text><Slider min={5} max={30} step={1} value={physics.throwForce} onChange={(v) => updatePhysics('throwForce', v)} /></div>
                  <div><Text style={{ fontSize: 11 }}>旋转力 {physics.spinForce}</Text><Slider min={2} max={20} step={1} value={physics.spinForce} onChange={(v) => updatePhysics('spinForce', v)} /></div>
                </Space>
              ),
            },
          ]}
        />
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
