import { useReducer } from 'react'
import { theme } from 'antd'
import { createInitialState, reducer, rollDice } from '../../game/monopoly/engine'
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

  const current = state.players.find((p) => p.id === state.turn.currentPlayerId)
  const onRoll = () => dispatch({ type: 'ROLL_DICE', dice: rollDice() })
  const onEndTurn = () => dispatch({ type: 'END_TURN' })
  const onDecide = (optionId: string) => dispatch({ type: 'RESOLVE_DECISION', optionId })
  const onMortgage = (tileId: number) => dispatch({ type: 'MORTGAGE_PROPERTY', tileId })
  const onRedeem = (tileId: number) => dispatch({ type: 'REDEEM_PROPERTY', tileId })

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
          onRoll={onRoll}
          onEndTurn={onEndTurn}
          onMortgage={onMortgage}
          onRedeem={onRedeem}
        />
      </div>
      <DecisionModal state={state} onDecide={onDecide} />
    </div>
  )
}
