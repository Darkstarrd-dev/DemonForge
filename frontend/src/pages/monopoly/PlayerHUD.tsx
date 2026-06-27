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
              opacity: p.bankrupt ? 0.45 : 1,
            }}
          >
            {/* 角色头像（首字母色块；接真实角色卡后可换为图片） */}
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: p.color,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {p.name.slice(0, 1)}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: token.colorText }}>
                {p.name}
                <span style={{ marginLeft: 6, fontSize: 11, color: token.colorTextSecondary }}>
                  {p.bankrupt ? '已出局' : p.controller === 'human' ? '玩家' : 'AI'}
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
