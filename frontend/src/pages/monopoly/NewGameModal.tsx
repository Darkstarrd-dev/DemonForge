import { useState } from 'react'
import { Modal, Segmented, Select, Space, Typography, Radio, Avatar } from 'antd'
import type { ControllerKind, NewGamePlayerSpec } from '../../game/monopoly/types'
import { mapEntityCardToCharacter } from '../../game/monopoly/engine/character-mapper'
import { getConfigPresets, getMapList } from '../../game/monopoly/engine/loader'
import { useAppStore } from '../../store/appStore'

const MAPS = getMapList()
const PRESETS = getConfigPresets()

interface Props {
  open: boolean
  onClose: () => void
  onStart: (specs: NewGamePlayerSpec[], mapId: string, configPresetId: string) => void
}

function getAvatarUrl(characterCardId: string | undefined, cards: ReturnType<typeof useAppStore.getState>['cards']): string | undefined {
  if (!characterCardId) return
  const card = cards.find((c) => c.id === characterCardId)
  if (!card) return
  const img = card.coverImageId ? card.images?.find((i) => i.id === card.coverImageId) : card.images?.[0]
  return img?.url
}

export default function NewGameModal({ open, onClose, onStart }: Props) {
  const allCards = useAppStore((s) => s.cards)
  const characters = allCards.filter((c) => c.type === 'character').map(mapEntityCardToCharacter)

  const [mapId, setMapId] = useState('classic-40')
  const [presetId, setPresetId] = useState(PRESETS[0]?.id ?? 'richman4-default')
  const [count, setCount] = useState(Math.min(3, characters.length || 2))
  const [slots, setSlots] = useState(() =>
    characters.slice(0, count).map((c, i) => ({
      charId: c.id,
      controller: (i === 0 ? 'human' : 'ai') as ControllerKind,
      difficulty: 'normal' as 'easy' | 'normal' | 'hard',
    })),
  )

  const setSlot = (i: number, patch: Partial<{ charId: string; controller: 'human' | 'ai'; difficulty: 'easy' | 'normal' | 'hard' }>) =>
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  const handleCountChange = (n: number) => {
    setCount(n)
    setSlots((prev) => {
      const cur: { charId: string; controller: 'human' | 'ai'; difficulty: 'easy' | 'normal' | 'hard' }[] = prev.slice(0, n)
      while (cur.length < n && characters.length > 0) {
        cur.push({ charId: characters[cur.length % characters.length].id, controller: 'ai' as ControllerKind, difficulty: 'normal' })
      }
      return cur
    })
  }

  const handleStart = () => {
    const specs: NewGamePlayerSpec[] = slots.slice(0, count).map((s) => {
      const ch = characters.find((c) => c.id === s.charId) ?? characters[0]
      return {
        name: ch.name,
        color: ch.color,
        controller: s.controller,
        characterCardId: ch.id,
        aiDifficulty: s.controller === 'ai' ? s.difficulty : undefined,
      }
    })
    onStart(specs, mapId, presetId)
    onClose()
  }

  return (
    <Modal open={open} title="新游戏" onCancel={onClose} onOk={handleStart} okText="开始游戏" width={500}>
      <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 8 }}>
        <Space>
          <Typography.Text type="secondary">玩家人数</Typography.Text>
          <Segmented
            value={count}
            onChange={(v) => handleCountChange(v as number)}
            options={[2, 3, 4].filter((n) => n <= characters.length).map((n) => ({ label: `${n} 人`, value: n }))}
          />
        </Space>

        <div>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>游戏版本</Typography.Text>
          <Radio.Group value={presetId} onChange={(e) => setPresetId(e.target.value)}>
            {PRESETS.map((p) => (
              <Radio key={p.id} value={p.id} style={{ display: 'block', marginBottom: 4 }}>
                {p.name}
              </Radio>
            ))}
          </Radio.Group>
        </div>

        <div>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>选择地图</Typography.Text>
          <Radio.Group value={mapId} onChange={(e) => setMapId(e.target.value)}>
            {MAPS.map((m) => (
              <Radio key={m.id} value={m.id} style={{ display: 'block', marginBottom: 4 }}>
                {m.name}
              </Radio>
            ))}
          </Radio.Group>
        </div>

        {slots.slice(0, count).map((s, i) => {
          const avatarUrl = getAvatarUrl(s.charId, allCards)
          const charName = characters.find((c) => c.id === s.charId)?.name ?? '?'
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Typography.Text style={{ width: 52, flexShrink: 0 }}>玩家 {i + 1}</Typography.Text>
              <Avatar size={28} src={avatarUrl} style={{ flexShrink: 0, backgroundColor: '#1677ff' }}>
                {charName[0]}
              </Avatar>
              <Select
                value={s.charId}
                onChange={(v) => setSlot(i, { charId: v })}
                options={characters.map((c) => ({ value: c.id, label: c.name }))}
                style={{ flex: 1, minWidth: 100 }}
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
              {s.controller === 'ai' && (
                <Select
                  size="small"
                  value={s.difficulty}
                  onChange={(v) => setSlot(i, { difficulty: v as 'easy' | 'normal' | 'hard' })}
                  style={{ width: 80 }}
                  options={[
                    { value: 'easy', label: '简单' },
                    { value: 'normal', label: '普通' },
                    { value: 'hard', label: '困难' },
                  ]}
                />
              )}
            </div>
          )
        })}
      </Space>
    </Modal>
  )
}
