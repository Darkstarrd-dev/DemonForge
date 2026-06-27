import { Button, theme } from 'antd'
import type { GameState, Player } from '../../game/monopoly/types'

interface Props {
  state: GameState
  current?: Player
  onRoll: () => void
  onEndTurn: () => void
  onMortgage: (tileId: number) => void
  onRedeem: (tileId: number) => void
}

export default function GamePanel({
  state,
  current,
  onRoll,
  onEndTurn,
  onMortgage,
  onRedeem,
}: Props) {
  const { token } = theme.useToken()
  const { phase, dice } = state.turn
  const ended = state.status === 'ended'
  const winner = ended ? state.players.find((p) => p.id === state.winnerId) : undefined
  const inHospital = current ? current.inJailTurns > 0 : false
  const myTiles = current ? current.ownedTileIds : []

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: `1px solid ${token.colorBorderSecondary}`,
        overflow: 'hidden',
      }}
    >
      {/* 当前回合 / 胜者 */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
          {ended ? '游戏结束' : '当前回合'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          {ended ? (
            <>
              <span style={{ fontSize: 18 }}>🏆</span>
              <span style={{ fontWeight: 600, fontSize: 16, color: token.colorText }}>
                {winner?.name ?? '—'} 获胜
              </span>
            </>
          ) : (
            <>
              {current && (
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: current.color }} />
              )}
              <span style={{ fontWeight: 600, fontSize: 16, color: token.colorText }}>
                {current?.name ?? '-'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* 骰子 + 操作 */}
      <div
        style={{
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div style={{ display: 'flex', gap: 12 }}>
          {[0, 1].map((i) => (
            <div
              key={i}
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                border: `2px solid ${token.colorBorder}`,
                background: token.colorBgContainer,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                fontWeight: 700,
                color: token.colorText,
              }}
            >
              {dice ? dice[i] : '·'}
            </div>
          ))}
        </div>
        {dice && (
          <div style={{ fontSize: 13, color: token.colorTextSecondary }}>合计 {dice[0] + dice[1]} 点</div>
        )}

        {!ended && phase === 'ROLL' && (
          <Button type="primary" block onClick={onRoll}>
            {inHospital ? '住院中 · 跳过回合' : '掷骰子'}
          </Button>
        )}
        {!ended && phase === 'DECIDE' && (
          <div style={{ fontSize: 13, color: token.colorTextSecondary }}>请在弹窗中做出选择…</div>
        )}
        {!ended && phase === 'END_TURN' && (
          <Button block onClick={onEndTurn}>
            结束回合
          </Button>
        )}
      </div>

      {/* 我的地产（抵押 / 赎回） */}
      {myTiles.length > 0 && (
        <div
          style={{
            padding: '8px 12px',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            maxHeight: 168,
            overflow: 'auto',
          }}
        >
          <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 6 }}>
            我的地产 · {current?.name}
          </div>
          {myTiles.map((tid) => {
            const tile = state.board.tiles[tid]
            const prop = state.properties[tid]
            const levelLabel = prop.level >= 4 ? '地标' : `${prop.level}级`
            return (
              <div
                key={tid}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '4px 0',
                }}
              >
                <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 12, color: token.colorText }}>{tile.name}</span>
                  <span style={{ fontSize: 11, color: token.colorTextSecondary, marginLeft: 6 }}>
                    {levelLabel}
                    {prop.mortgaged ? ' · 抵押中' : ''}
                  </span>
                </div>
                {prop.mortgaged ? (
                  <Button size="small" disabled={ended} onClick={() => onRedeem(tid)}>
                    赎回
                  </Button>
                ) : (
                  <Button size="small" disabled={ended} onClick={() => onMortgage(tid)}>
                    抵押
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 对局日志（最新在上） */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '8px 12px' }}>
        <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 6 }}>对局日志</div>
        {[...state.log].reverse().map((e) => (
          <div
            key={e.seq}
            style={{
              fontSize: 12,
              color: token.colorText,
              padding: '3px 0',
              borderBottom: `1px solid ${token.colorFillQuaternary}`,
            }}
          >
            {e.text}
          </div>
        ))}
      </div>
    </div>
  )
}
