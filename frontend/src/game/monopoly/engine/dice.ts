// 骰子工具：随机源外置（§4.4），独立于 reducer，可被 mock。
// 人类玩家与 AI 玩家共用同一随机源，dice 经 action 传入 reducer。

export function getDiceCount(vehicle?: string): number {
  if (vehicle === 'CAR') return 3
  if (vehicle === 'MOTORCYCLE') return 2
  return 2
}

export function rollDice(vehicle?: string): number[] {
  const count = getDiceCount(vehicle)
  return Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6))
}