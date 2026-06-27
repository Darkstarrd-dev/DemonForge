import { useState } from 'react'
import { Modal, Segmented, Select, Space, Typography } from 'antd'
import type { NewGamePlayerSpec } from '../../game/monopoly/types'
import { PRESET_CHARACTERS } from '../../game/monopoly/characters.preset'

type Slot = { charId: string; controller: 'human' | 'ai' }

interface Props {
  open: boolean
  onClose: () => void
  onStart: (specs: NewGamePlayerSpec[]) => void
}

function defaultSlots(): Slot[] {
  return PRESET_CHARACTERS.slice(0, 4).map((c, i) => ({
    charId: c.id,
    controller: i === 0 ? 'human' : 'ai',
  }))
}

export default function NewGameModal({ open, onClose, onStart }: Props) {
  const [count, setCount] = useState(3)
  const [slots, setSlots] = useState<Slot[]>(defaultSlots)

  const setSlot = (i: number, patch: Partial<Slot>) =>
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  const handleStart = () => {
    const specs: NewGamePlayerSpec[] = slots.slice(0, count).map((s) => {
      const c = PRESET_CHARACTERS.find((ch) => ch.id === s.charId) ?? PRESET_CHARACTERS[0]
      return { name: c.name, color: c.color, controller: s.controller, characterCardId: c.id }
    })
    onStart(specs)
    onClose()
  }

  return (
    <Modal open={open} title="新游戏" onCancel={onClose} onOk={handleStart} okText="开始游戏" width={460}>
      <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 8 }}>
        <Space>
          <Typography.Text type="secondary">玩家人数</Typography.Text>
          <Segmented
            value={count}
            onChange={(v) => setCount(v as number)}
            options={[2, 3, 4].map((n) => ({ label: `${n} 人`, value: n }))}
          />
        </Space>

        {slots.slice(0, count).map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Typography.Text style={{ width: 52, flexShrink: 0 }}>玩家 {i + 1}</Typography.Text>
            <Select
              value={s.charId}
              onChange={(v) => setSlot(i, { charId: v })}
              options={PRESET_CHARACTERS.map((c) => ({ value: c.id, label: c.name }))}
              style={{ flex: 1 }}
            />
            <Segmented
              size="small"
              value={s.controller}
              onChange={(v) => setSlot(i, { controller: v as 'human' | 'ai' })}
              options={[
                { label: '玩家', value: 'human' },
                { label: 'AI', value: 'ai' },
              ]}
            />
          </div>
        ))}
      </Space>
    </Modal>
  )
}
