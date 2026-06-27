import { useReducer } from 'react'
import { theme } from 'antd'
import { createInitialState, reducer } from '../../game/monopoly/engine'
import { createDefaultBoard } from '../../game/monopoly/board.preset'
import type { GameState, NewGamePlayerSpec } from '../../game/monopoly/types'
import Board from './Board'
import PlayerHUD from './PlayerHUD'

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
  // 引擎即 reducer；P0 为静态展示，dispatch 留待 P1（骰子 / 回合）接入
  const [state] = useReducer(reducer, undefined, initGame)

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
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        <Board state={state} />
      </div>
    </div>
  )
}
