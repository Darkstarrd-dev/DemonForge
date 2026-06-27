import { useEffect, useReducer } from 'react'
import { theme } from 'antd'
import { createInitialState, reducer, rollDice } from '../../game/monopoly/engine'
import { aiNextAction } from '../../game/monopoly/ai'
import { createDefaultBoard } from '../../game/monopoly/board.preset'
import type { GameState, NewGamePlayerSpec } from '../../game/monopoly/types'
import Board from './Board'
import PlayerHUD from './PlayerHUD'
import GamePanel from './GamePanel'
import DecisionModal from './DecisionModal'

const DEFAULT_PLAYERS: NewGamePlayerSpec[] = [
  { name: '红方', color: '#E74C3C', controller: 'human' },
  { name: '蓝方', color: '#3498DB', controller: 'ai' },
  { name: '绿方', color: '#27AE60', controller: 'ai' },
]

const AI_DELAY = 800 // AI 每步延迟（ms），便于观察

function initGame(): GameState {
  return createInitialState({
    board: createDefaultBoard(),
    players: DEFAULT_PLAYERS,
    startingCash: 15000,
  })
}

export default function MonopolyPage() {
  const { token } = theme.useToken()
  const [state, dispatch] = useReducer(reducer, undefined, initGame)

  // AI 自动驾驶：当前为 AI 回合时，延迟后自动执行下一步；轮到 human 则停下等操作。
  // 每次 state 变化重新评估，形成 human/AI 混合循环。
  useEffect(() => {
    const action = aiNextAction(state)
    if (!action) return
    const timer = setTimeout(() => dispatch(action), AI_DELAY)
    return () => clearTimeout(timer)
  }, [state])

  const current = state.players.find((p) => p.id === state.turn.currentPlayerId)
  const onRoll = () => dispatch({ type: 'ROLL_DICE', dice: rollDice() })
  const onEndTurn = () => dispatch({ type: 'END_TURN' })
  const onDecide = (optionId: string) => dispatch({ type: 'RESOLVE_DECISION', optionId })
  const onMortgage = (tileId: number) => dispatch({ type: 'MORTGAGE_PROPERTY', tileId })
  const onRedeem = (tileId: number) => dispatch({ type: 'REDEEM_PROPERTY', tileId })

  // 仅 human 玩家可手动操作；AI 回合交给自动循环
  const interactive = current?.controller === 'human'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: token.colorBgLayout,
      }}
    >
      <PlayerHUD players={state.players} currentPlayerId={state.turn.currentPlayerId} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <Board state={state} />
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
    </div>
  )
}
