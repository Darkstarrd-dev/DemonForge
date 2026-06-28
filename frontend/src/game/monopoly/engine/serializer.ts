// 存档 / 读档序列化（M10+ 实现，M0 骨架）
import type { FullGameState, SaveGame, GameConfig } from '../types'

export function serializeGame(state: FullGameState, config: GameConfig): SaveGame {
  return {
    version: 'richman4@1.0',
    timestamp: Date.now(),
    gameState: state,
    config,
  }
}

export function deserializeGame(save: SaveGame): { state: FullGameState; config: GameConfig } {
  return { state: save.gameState, config: save.config }
}
