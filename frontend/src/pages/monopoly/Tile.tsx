import { theme } from 'antd'
import type { Player, PropertyState, Tile } from '../../game/monopoly/types'

interface Props {
  tile: Tile
  property?: PropertyState
  owner?: Player // 地产业主，染边框
  occupants: Player[] // 当前停在此格的玩家
}

export default function TileCell({ tile, property, owner, occupants }: Props) {
  const { token } = theme.useToken()
  const isProperty = tile.type === 'property'

  return (
    <div
      style={{
        gridRow: tile.coord.row,
        gridColumn: tile.coord.col,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: 4,
        background: token.colorBgContainer,
        fontSize: 10,
        boxShadow: owner ? `inset 0 0 0 2px ${owner.color}` : undefined,
      }}
    >
      {/* 街区色带 */}
      {isProperty && <div style={{ height: 7, background: tile.color, flexShrink: 0 }} />}

      {/* 名称 + 价格 + 等级 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: '2px 3px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        <div style={{ fontWeight: 600, lineHeight: 1.1, color: token.colorText }}>{tile.name}</div>
        {isProperty && <div style={{ color: token.colorTextSecondary }}>¥{tile.price}</div>}
        {isProperty && property && property.level > 0 && (
          <div style={{ color: tile.color, letterSpacing: 1, lineHeight: 1 }}>
            {property.level >= 4 ? '★' : '●'.repeat(property.level)}
          </div>
        )}
      </div>

      {/* 棋子（玩家色点） */}
      {occupants.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            justifyContent: 'center',
            padding: '0 2px 2px',
          }}
        >
          {occupants.map((p) => (
            <span
              key={p.id}
              title={p.name}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: p.color,
                border: `1px solid ${token.colorBgContainer}`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
