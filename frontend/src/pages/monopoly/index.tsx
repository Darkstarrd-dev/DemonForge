import { useEffect, useReducer, useState } from 'react'
import { Button, Segmented, Typography, theme } from 'antd'
import { createInitialState, reducer, rollDice, loadMapData, boardDataToBoardConfig } from '../../game/monopoly/engine'
import { aiNextAction } from '../../game/monopoly/ai'
import { PRESET_CHARACTERS } from '../../game/monopoly/characters.preset'
import type { GameState, NewGamePlayerSpec } from '../../game/monopoly/types'
import Board from './Board'
import Board3D from './Board3D'
import PlayerHUD from './PlayerHUD'
import GamePanel from './GamePanel'
import DecisionModal from './DecisionModal'
import NewGameModal from './NewGameModal'

// 默认用前 3 个示例角色（玩家 1 为人类，其余 AI）
const DEFAULT_PLAYERS: NewGamePlayerSpec[] = PRESET_CHARACTERS.slice(0, 3).map(
  (c, i): NewGamePlayerSpec => ({
    name: c.name,
    color: c.color,
    controller: i === 0 ? 'human' : 'ai',
    characterCardId: c.id,
  }),
)

const AI_DELAY = 800 // AI 每步延迟（ms），便于观察

function initGame(): GameState {
  const { board } = boardDataToBoardConfig(loadMapData('classic-40').boardData)
  return createInitialState({
    board,
    players: DEFAULT_PLAYERS,
    startingCash: 15000,
    mapId: 'classic-40',
  })
}

export default function MonopolyPage() {
  const { token } = theme.useToken()
  const [state, dispatch] = useReducer(reducer, undefined, initGame)
  const [newGameOpen, setNewGameOpen] = useState(false)
  const [view, setView] = useState<'2d' | '3d'>('2d')

  // AI 自动驾驶：当前为 AI 回合时延迟自动执行下一步；轮到 human 则停下等操作。
  useEffect(() => {
    const action = aiNextAction(state)
    if (!action) return
    const timer = setTimeout(() => dispatch(action), AI_DELAY)
    return () => clearTimeout(timer)
  }, [state])

  const current = state.players.find((p) => p.id === state.turn.currentPlayerId)
  const interactive = current?.controller === 'human'
  const onRoll = () => dispatch({ type: 'ROLL_DICE', dice: rollDice() })
  const onEndTurn = () => dispatch({ type: 'END_TURN' })
  const onDecide = (optionId: string) => dispatch({ type: 'RESOLVE_DECISION', optionId })
  const onMortgage = (tileId: number) => dispatch({ type: 'MORTGAGE_PROPERTY', tileId })
  const onRedeem = (tileId: number) => dispatch({ type: 'REDEEM_PROPERTY', tileId })
  const onStartNewGame = (players: NewGamePlayerSpec[], mapId: string) => {
    const { board } = boardDataToBoardConfig(loadMapData(mapId).boardData)
    dispatch({
      type: 'NEW_GAME',
      config: { board, players, startingCash: 15000, mapId },
    })
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: token.colorBgLayout,
      }}
    >
      {/* 工具栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '8px 16px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          flexShrink: 0,
        }}
      >
        <Typography.Text strong style={{ fontSize: 15, color: token.colorText }}>
          🎲 大富翁
        </Typography.Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Segmented
            value={view}
            onChange={(v) => setView(v as '2d' | '3d')}
            options={[
              { label: '2D', value: '2d' },
              { label: '3D', value: '3d' },
            ]}
          />
          <Button size="small" onClick={() => setNewGameOpen(true)}>
            新游戏
          </Button>
        </div>
      </div>

      <PlayerHUD players={state.players} currentPlayerId={state.turn.currentPlayerId} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
          {view === '2d' ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                overflow: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
              }}
            >
              <Board state={state} />
            </div>
          ) : (
            <Board3D state={state} />
          )}
        </div>
        <GamePanel
          state={state}
          current={current}
          interactive={interactive}
          onRoll={onRoll}
          onEndTurn={onEndTurn}
          onMortgage={onMortgage}
          onRedeem={onRedeem}
        />
      </div>

      <DecisionModal state={state} interactive={interactive} onDecide={onDecide} />
      <NewGameModal open={newGameOpen} onClose={() => setNewGameOpen(false)} onStart={onStartNewGame} />
    </div>
  )
}
