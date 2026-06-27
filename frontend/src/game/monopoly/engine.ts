// 大富翁规则引擎：纯函数 reducer + 初始状态构造。
// P0 仅 createInitialState + NEW_GAME；移动 / 经济 / 决策逻辑见后续阶段
// （docs/monopoly_plan.md §8）。

import type { Action, GameState, NewGameConfig, Player, PropertyState } from './types'

export function createInitialState(config: NewGameConfig): GameState {
  const players: Player[] = config.players.map((spec, i) => ({
    id: `p${i + 1}`,
    name: spec.name,
    color: spec.color,
    cash: config.startingCash,
    position: 0,
    inJailTurns: 0,
    ownedTileIds: [],
    bankrupt: false,
    characterCardId: spec.characterCardId,
    controller: spec.controller,
    aiNodeId: spec.aiNodeId,
  }))

  // 仅为地产格建运行态，与 Tile 静态数据分离。
  const properties: Record<number, PropertyState> = {}
  for (const tile of config.board.tiles) {
    if (tile.type === 'property') {
      properties[tile.index] = { tileId: tile.index, level: 0, mortgaged: false }
    }
  }

  return {
    board: config.board,
    players,
    properties,
    turn: { currentPlayerId: players[0].id, phase: 'ROLL', doublesCount: 0 },
    log: [{ seq: 0, kind: 'gameStart', text: '游戏开始' }],
    status: 'playing',
  }
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'NEW_GAME':
      return createInitialState(action.config)
    default:
      return state
  }
}
