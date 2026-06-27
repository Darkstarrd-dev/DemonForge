import { theme } from 'antd'
import type { Player } from '../../game/monopoly/types'

interface Props {
  players: Player[]
  currentPlayerId: string
}

export default function PlayerHUD({ players, currentPlayerId }: Props) {
  const { token } = theme.useToken()

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        padding: '10px 16px',
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        flexShrink: 0,
      }}
    >
      {players.map((p) => {
        const active = p.id === currentPlayerId
        return (
          <div
            key={p.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 8,
              border: `1px solid ${active ? p.color : token.colorBorderSecondary}`,
              background: active ? token.colorFillTertiary : token.colorBgContainer,
            }}
          >
            <span
              style={{ width: 14, height: 14, borderRadius: '50%', background: p.color, flexShrink: 0 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: token.colorText }}>
                {p.name}
                <span style={{ marginLeft: 6, fontSize: 11, color: token.colorTextSecondary }}>
                  {p.controller === 'human' ? '玩家' : 'AI'}
                </span>
              </span>
              <span style={{ fontSize: 12, color: token.colorTextSecondary }}>
                ¥{p.cash.toLocaleString()}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
