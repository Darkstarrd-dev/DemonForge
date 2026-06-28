import { theme, Tooltip } from 'antd'
import type { Player, GameState } from '../../game/monopoly/types'
import { useAppStore } from '../../store/appStore'

interface Props {
  players: Player[]
  currentPlayerId: string
  state: GameState
}

function getAvatarUrl(characterCardId: string | undefined): string | undefined {
  if (!characterCardId) return
  const card = useAppStore.getState().cards.find((c) => c.id === characterCardId)
  if (!card) return
  const img = card.coverImageId ? card.images?.find((i) => i.id === card.coverImageId) : card.images?.[0]
  return img?.url
}

function calcTotalAssets(player: Player, state: GameState): number {
  let assets = player.cash + (player.bankDeposit ?? 0)
  for (const tid of player.ownedTileIds) {
    const tile = state.board.tiles.find((t) => t.id === tid)
    const prop = state.board.properties[tid]
    if (prop && !prop.mortgaged) {
      assets += (tile?.basePrice ?? 0) + (prop.level * (tile?.basePrice ?? 0) * 0.3)
    }
  }
  for (const shares of Object.values(player.stocks ?? {})) {
    const companyId = Object.keys(player.stocks ?? {}).find((k) => (player.stocks?.[k] ?? 0) === shares)
    const company = state.economy?.companies[companyId ?? '']
    assets += shares * (company?.stockPrice ?? 100)
  }
  return assets
}

function getVehicleLabel(v?: string): string {
  if (v === 'CAR') return '汽车'
  if (v === 'MOTORCYCLE') return '摩托车'
  return '步行'
}

export default function PlayerHUD({ players, currentPlayerId, state }: Props) {
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
        const avatarUrl = getAvatarUrl(p.characterCardId)
        const totalAssets = calcTotalAssets(p, state)
        const bankDeposit = p.bankDeposit ?? 0
        const bankLoan = p.bankLoan ?? 0
        const stockCount = Object.values(p.stocks ?? {}).reduce((s, v) => s + v, 0)
        const hasGod = !!p.godId
        const godDef = hasGod ? state.cardDeck?.definitions?.find((d) => d.id === p.godId) : undefined

        return (
          <Tooltip
            key={p.id}
            title={
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                <div>总资产: ¥{totalAssets.toLocaleString()}</div>
                {bankDeposit > 0 && <div>银行存款: ¥{bankDeposit.toLocaleString()}</div>}
                {bankLoan > 0 && <div>银行贷款: ¥{bankLoan.toLocaleString()}</div>}
                {stockCount > 0 && <div>持股: {stockCount} 股</div>}
                {hasGod && <div>神明: {godDef?.name ?? p.godId} (剩{p.godRemainingDays}天)</div>}
                <div>交通工具: {getVehicleLabel(p.vehicle)}</div>
                <div>地产: {p.ownedTileIds.length} 处</div>
                <div>点数: {p.points ?? 0}</div>
              </div>
            }
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${active ? p.color : token.colorBorderSecondary}`,
                background: active ? token.colorFillTertiary : token.colorBgContainer,
                opacity: p.bankrupt ? 0.45 : 1,
                cursor: 'default',
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={p.name}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                />
              ) : (
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
              )}
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: token.colorText }}>
                  {p.name}
                  <span style={{ marginLeft: 6, fontSize: 11, color: token.colorTextSecondary }}>
                    {p.bankrupt ? '已出局' : p.controller === 'human' ? '玩家' : 'AI'}
                  </span>
                </span>
                <span style={{ fontSize: 12, color: token.colorTextSecondary }}>
                  ¥{p.cash.toLocaleString()}
                  {bankDeposit > 0 && <span style={{ marginLeft: 4, color: token.colorTextTertiary }}>·存¥{bankDeposit.toLocaleString()}</span>}
                  {bankLoan > 0 && <span style={{ marginLeft: 4, color: '#e74c3c' }}>·贷¥{bankLoan.toLocaleString()}</span>}
                </span>
              </div>
            </div>
          </Tooltip>
        )
      })}
    </div>
  )
}