import { theme } from 'antd'
import type { GameState, Player } from '../../game/monopoly/types'
import TileCell from './Tile'

const SIDE = 11 // 与 board.preset 的 grid 边长一致

export default function Board({ state }: { state: GameState }) {
  const { token } = theme.useToken()

  // index -> 停在此格的玩家
  const occupantsByTile = new Map<number, Player[]>()
  for (const p of state.players) {
    const list = occupantsByTile.get(p.position) ?? []
    list.push(p)
    occupantsByTile.set(p.position, list)
  }
  // id -> player（查地产业主色）
  const playerById = new Map(state.players.map((p) => [p.id, p]))

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${SIDE}, 1fr)`,
        gridTemplateRows: `repeat(${SIDE}, 1fr)`,
        gap: 4,
        width: 'min(82vh, 100%)',
        maxWidth: '100%',
        aspectRatio: '1 / 1',
      }}
    >
      {state.board.tiles.map((tile) => {
        const property = state.properties[tile.index]
        const owner = property?.ownerId ? playerById.get(property.ownerId) : undefined
        return (
          <TileCell
            key={tile.index}
            tile={tile}
            property={property}
            owner={owner}
            occupants={occupantsByTile.get(tile.index) ?? []}
          />
        )
      })}

      {/* 中间信息区（跨内圈 2..SIDE-1） */}
      <div
        style={{
          gridColumn: `2 / ${SIDE}`,
          gridRow: `2 / ${SIDE}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 4, color: token.colorText }}>
          大富翁
        </div>
        <div style={{ fontSize: 13, color: token.colorTextSecondary }}>2D Blockout · P0 地基</div>
      </div>
    </div>
  )
}
