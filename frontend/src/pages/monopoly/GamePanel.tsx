import { useState } from 'react'
import { Button, Modal, Segmented, Select, Space, Tag, theme, Typography } from 'antd'
import type { GameState, Player } from '../../game/monopoly/types'

interface Props {
  state: GameState
  current?: Player
  interactive: boolean
  onRoll: () => void
  onEndTurn: () => void
  onMortgage: (tileId: number) => void
  onRedeem: (tileId: number) => void
  onUseCard: (cardInstanceId: string, targetId?: string, targetTileId?: number) => void
  onBuyCard?: (cardDefId: string) => void
  onUseItem?: (itemInstanceId: string, targetId?: string, targetTileId?: number) => void
  onBuyItem?: (itemDefId: string) => void
}

export default function GamePanel({
  state, current, interactive, onRoll, onEndTurn,
  onMortgage, onRedeem, onUseCard, onBuyCard,
  onUseItem, onBuyItem,
}: Props) {
  const { token } = theme.useToken()
  const { phase, dice } = state.turn
  const ended = state.status === 'ended'
  const winner = ended ? state.players.find((p) => p.id === state.winnerId) : undefined
  const inHospital = current ? current.inJailTurns > 0 : false
  const myTiles = current ? current.ownedTileIds : []
  const [cardShopOpen, setCardShopOpen] = useState(false)
  const [shopTab, setShopTab] = useState<string>('cards')
  const [useCardModal, setUseCardModal] = useState<{ instanceId: string; defName: string } | null>(null)
  const [useItemModal, setUseItemModal] = useState<{ instanceId: string; defName: string; defId: string } | null>(null)

  const hand = current?.hand ?? []
  const points = current?.points ?? 0
  const deck = state.cardDeck
  const opponents = state.players.filter(p => p.id !== current?.id && !p.bankrupt)
  const opponentTiles = state.board.tiles
    .map((t, i) => ({ ...t, index: i }))
    .filter(t => {
      const prop = state.properties[t.index]
      return prop && prop.ownerId && prop.ownerId !== current?.id && prop.level > 0
    })

  const handleUseCard = (instanceId: string) => {
    const inst = hand.find(c => c.instanceId === instanceId)
    if (!inst || !deck) return
    const def = deck.definitions.find(d => d.id === inst.definitionId)
    if (!def) return
    if (def.targetType === 'SELF') {
      onUseCard(instanceId)
    } else {
      setUseCardModal({ instanceId, defName: def.name })
    }
  }

  const itemDeck = state.itemDeck
  const items = current?.items ?? []
  const handleUseItem = (instanceId: string) => {
    const inst = items.find(c => c.instanceId === instanceId)
    if (!inst || !itemDeck) return
    const def = itemDeck.definitions.find(d => d.id === inst.definitionId)
    if (!def) return
    const selfUseItems = ['item-00', 'item-01', 'item-06', 'item-10']
    if (selfUseItems.includes(def.id)) {
      onUseItem?.(instanceId)
    } else {
      setUseItemModal({ instanceId, defName: def.name, defId: def.id })
    }
  }

  return (
    <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: `1px solid ${token.colorBorderSecondary}`, overflow: 'hidden' }}>
      {/* Current turn */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
          {ended ? '游戏结束' : `第 ${state.day ?? 1} 天`}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          {ended ? (
            <span style={{ fontWeight: 600, fontSize: 16, color: token.colorText }}>
              🏆 {winner?.name ?? '—'} 获胜
            </span>
          ) : (
            <>
              {current && <span style={{ width: 14, height: 14, borderRadius: '50%', background: current.color }} />}
              <span style={{ fontWeight: 600, fontSize: 16, color: token.colorText }}>{current?.name ?? '-'}</span>
              <span style={{ fontSize: 11, color: token.colorTextSecondary }}>
                {current?.controller === 'human' ? '玩家' : 'AI'}
                {current?.inJailTurns ? ` · 住院${current.inJailTurns}回合` : ''}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Dice + Actions */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {(dice ?? [undefined, undefined]).map((v, i) => (
            <div key={i} style={{ width: 48, height: 48, borderRadius: 8, border: `2px solid ${token.colorBorder}`, background: token.colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: token.colorText }}>
              {v ?? '·'}
            </div>
          ))}
        </div>
        {dice && <div style={{ fontSize: 13, color: token.colorTextSecondary }}>合计 {dice.reduce((s, v) => s + v, 0)} 点</div>}

        {ended ? null : !interactive ? (
          <div style={{ fontSize: 13, color: token.colorTextSecondary }}>AI 行动中…</div>
        ) : phase === 'ROLL' ? (
          <Space style={{ width: '100%' }}>
            <Button type="primary" block onClick={onRoll}>
              {inHospital ? '跳过回合' : '掷骰子'}
            </Button>
            {hand.length > 0 && (
              <Select
                placeholder="用卡"
                size="small"
                style={{ width: 90 }}
                onChange={handleUseCard}
                options={hand.map(c => {
                  const def = deck?.definitions.find(d => d.id === c.definitionId)
                  return { value: c.instanceId, label: def?.name ?? c.definitionId }
                })}
              />
            )}
          </Space>
        ) : phase === 'DECIDE' ? (
          <div style={{ fontSize: 13, color: token.colorTextSecondary }}>请在弹窗中做出选择…</div>
        ) : (
          <Space style={{ width: '100%' }}>
            <Button block onClick={onEndTurn}>结束回合</Button>
          </Space>
        )}
      </div>

      {/* Points + Shop */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${token.colorBorderSecondary}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography.Text style={{ fontSize: 12, color: token.colorTextSecondary }}>
          点数: <strong style={{ color: token.colorText }}>{points}</strong>
        </Typography.Text>
        {interactive && !ended && (
          <Button size="small" disabled={!deck && !itemDeck} onClick={() => setCardShopOpen(true)}>
            商店
          </Button>
        )}
      </div>

      {/* Card Hand */}
      {hand.length > 0 && (
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${token.colorBorderSecondary}`, maxHeight: 90, overflow: 'auto' }}>
          <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 6 }}>
            手牌 ({hand.length}/15)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {hand.map(c => {
              const def = deck?.definitions.find(d => d.id === c.definitionId)
              return (
                <Tag key={c.instanceId} color="blue" style={{ cursor: 'pointer', margin: 0 }}
                  onClick={() => handleUseCard(c.instanceId)}>
                  {def?.name ?? '?'}
                </Tag>
              )
            })}
          </div>
        </div>
      )}

      {/* Items */}
      {items.length > 0 && (
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${token.colorBorderSecondary}`, maxHeight: 90, overflow: 'auto' }}>
          <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 6 }}>
            道具 ({items.length}/5)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {items.map(c => {
              const def = itemDeck?.definitions.find(d => d.id === c.definitionId)
              return (
                <Tag key={c.instanceId} color="orange" style={{ cursor: 'pointer', margin: 0 }}
                  onClick={() => handleUseItem(c.instanceId)}>
                  {def?.name ?? '?'}
                  {c.durability > 0 && ` (${c.durability})`}
                </Tag>
              )
            })}
          </div>
        </div>
      )}

      {/* Properties */}
      {myTiles.length > 0 && (
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${token.colorBorderSecondary}`, maxHeight: 168, overflow: 'auto' }}>
          <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 6 }}>我的地产</div>
          {myTiles.map(tid => {
            const tile = state.board.tiles[tid]
            const prop = state.properties[tid]
            const levelLabel = prop.level >= 4 ? '地标' : `${prop.level}级`
            return (
              <div key={tid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 0' }}>
                <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 12, color: token.colorText }}>{tile.name}</span>
                  <span style={{ fontSize: 11, color: token.colorTextSecondary, marginLeft: 6 }}>
                    {levelLabel}{prop.mortgaged ? ' · 抵押中' : ''}
                  </span>
                </div>
                {prop.mortgaged
                  ? <Button size="small" disabled={ended || !interactive} onClick={() => onRedeem(tid)}>赎回</Button>
                  : <Button size="small" disabled={ended || !interactive} onClick={() => onMortgage(tid)}>抵押</Button>
                }
              </div>
            )
          })}
        </div>
      )}

      {/* Log */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '8px 12px' }}>
        <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 6 }}>对局日志</div>
        {[...state.log].reverse().map(e => (
          <div key={e.seq} style={{ fontSize: 12, color: token.colorText, padding: '3px 0', borderBottom: `1px solid ${token.colorFillQuaternary}` }}>
            {e.text}
          </div>
        ))}
      </div>

      {/* Shop Modal */}
      <Modal open={cardShopOpen} onCancel={() => setCardShopOpen(false)} footer={null} width={420}
        title={
          <Segmented<string>
            value={shopTab}
            onChange={setShopTab}
            options={[
              { label: '卡片', value: 'cards' },
              { label: '道具店', value: 'items' },
              { label: '研究所', value: 'research' },
            ]}
          />
        }
      >
        {shopTab === 'cards' && deck?.shopInventory.availableCards.map(cardId => {
          const def = deck.definitions.find(d => d.id === cardId)
          if (!def) return null
          const canBuy = points >= def.pointCost && (current?.hand ?? []).length < 15
          return (
            <div key={cardId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: token.colorText }}>{def.name}</div>
                <div style={{ fontSize: 11, color: token.colorTextSecondary }}>{def.description}</div>
              </div>
              <Space>
                <Tag>{def.pointCost} 点</Tag>
                <Button size="small" type="primary" disabled={!canBuy} onClick={() => { onBuyCard?.(cardId); setCardShopOpen(false) }}>
                  购买
                </Button>
              </Space>
            </div>
          )
        })}
        {shopTab === 'cards' && deck && deck.shopInventory.availableCards.length === 0 && (
          <Typography.Text type="secondary">商店暂无卡片库存</Typography.Text>
        )}

        {shopTab === 'items' && itemDeck?.shopInventory.availableItemIds.map(itemId => {
          const def = itemDeck.definitions.find(d => d.id === itemId)
          if (!def) return null
          const canBuy = points >= def.pointCost && (current?.items ?? []).length < 5
          return (
            <div key={itemId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: token.colorText }}>{def.name}</div>
                <div style={{ fontSize: 11, color: token.colorTextSecondary }}>{def.description}</div>
              </div>
              <Space>
                <Tag>{def.pointCost} 点</Tag>
                {def.durability > 0 && <Tag color="orange">{def.durability} 次</Tag>}
                <Button size="small" type="primary" disabled={!canBuy} onClick={() => { onBuyItem?.(itemId); setCardShopOpen(false) }}>
                  购买
                </Button>
              </Space>
            </div>
          )
        })}
        {shopTab === 'items' && itemDeck && itemDeck.shopInventory.availableItemIds.length === 0 && (
          <Typography.Text type="secondary">道具店暂无库存</Typography.Text>
        )}

        {shopTab === 'research' && itemDeck?.researchInventory.availableResearchIds.map(itemId => {
          const def = itemDeck.definitions.find(d => d.id === itemId)
          if (!def) return null
          const canBuy = points >= def.pointCost && (current?.items ?? []).length < 5
          return (
            <div key={itemId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: token.colorText }}>{def.name}</div>
                <div style={{ fontSize: 11, color: token.colorTextSecondary }}>{def.description}</div>
              </div>
              <Space>
                <Tag>{def.pointCost} 点</Tag>
                {def.durability > 0 && <Tag color="orange">{def.durability} 次</Tag>}
                <Button size="small" type="primary" disabled={!canBuy} onClick={() => { onBuyItem?.(itemId); setCardShopOpen(false) }}>
                  研发
                </Button>
              </Space>
            </div>
          )
        })}
        {shopTab === 'research' && itemDeck && itemDeck.researchInventory.availableResearchIds.length === 0 && (
          <Typography.Text type="secondary">研究所暂无可用项目</Typography.Text>
        )}
      </Modal>

      {/* Use Card Target Modal */}
      <Modal open={!!useCardModal} title={`使用「${useCardModal?.defName ?? ''}」`}
        onCancel={() => setUseCardModal(null)} footer={null} width={360}>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>选择目标</Typography.Text>
        {opponents.length > 0 && (
          <>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4, color: token.colorText }}>对手玩家</div>
            {opponents.map(p => (
              <Button key={p.id} block style={{ textAlign: 'left', marginBottom: 4 }}
                onClick={() => { onUseCard(useCardModal!.instanceId, p.id); setUseCardModal(null) }}>
                {p.name}
              </Button>
            ))}
          </>
        )}
        {opponentTiles.length > 0 && (
          <>
            <div style={{ fontWeight: 600, fontSize: 12, marginTop: 8, marginBottom: 4, color: token.colorText }}>对手地产</div>
            {opponentTiles.slice(0, 8).map(t => (
              <Button key={t.index} block style={{ textAlign: 'left', marginBottom: 4 }}
                onClick={() => { onUseCard(useCardModal!.instanceId, undefined, t.index); setUseCardModal(null) }}>
                {t.name}
              </Button>
            ))}
          </>
        )}
        <Button block style={{ marginTop: 8 }} onClick={() => { onUseCard(useCardModal!.instanceId); setUseCardModal(null) }}>
          对自己使用
        </Button>
      </Modal>

      {/* Use Item Target Modal */}
      <Modal open={!!useItemModal} title={`使用「${useItemModal?.defName ?? ''}」`}
        onCancel={() => setUseItemModal(null)} footer={null} width={360}>
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>选择目标</Typography.Text>
        {(() => {
          const defId = useItemModal?.defId
          if (!defId) return null
          const isPlayerTarget = defId === 'item-12'
          const isTileTarget = !isPlayerTarget
          if (isPlayerTarget) {
            return opponents.map(p => (
              <Button key={p.id} block style={{ textAlign: 'left', marginBottom: 4 }}
                onClick={() => { onUseItem?.(useItemModal!.instanceId, p.id); setUseItemModal(null) }}>
                {p.name}
              </Button>
            ))
          }
          if (isTileTarget) {
            const attackItems = ['item-02', 'item-03', 'item-09', 'item-11']
            const filterForAttack = attackItems.includes(defId)
            const tiles = state.board.tiles
              .map((t, i) => ({ ...t, index: i }))
              .filter(t => {
                const prop = state.properties[t.index]
                if (filterForAttack) return prop && prop.level > 0 && prop.ownerId && prop.ownerId !== current?.id
                return !prop || prop.level === 0 // placement goes on non-owned or empty properties
              })
            const isDiceItem = defId === 'item-08'
            const tileList = isDiceItem
              ? state.board.tiles.map((t, i) => ({ ...t, index: i })).filter((_, i) => i !== current?.position)
              : tiles
            return tileList.slice(0, 12).map(t => (
              <Button key={t.index} block style={{ textAlign: 'left', marginBottom: 4 }}
                onClick={() => { onUseItem?.(useItemModal!.instanceId, undefined, t.index); setUseItemModal(null) }}>
                {t.name}{state.properties[t.index]?.level > 0 ? ` (${state.properties[t.index].level}级)` : ''}
              </Button>
            ))
          }
        })()}
      </Modal>
    </div>
  )
}
