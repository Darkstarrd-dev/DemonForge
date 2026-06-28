// 3D 骰子静止后朝上面判定
// 依赖 Three.js 数学类型，不依赖场景/渲染器。
// 纯数学函数——可在测试中直接构造四元数验证。

import * as THREE from 'three'
import { DICE_FACE_DEFS } from './geometry'

// ════════════════════════════════════════════
// 单颗骰子朝上面判定
// ════════════════════════════════════════════

export function getUpFace(quaternion: THREE.Quaternion, sides: number): number {
  const faceDefs = DICE_FACE_DEFS[sides]
  if (!faceDefs) {
    throw new Error(`不支持的骰子面数: ${sides}`)
  }
  const worldUp = new THREE.Vector3(0, 1, 0)

  let bestValue = faceDefs[0].faceValue
  let bestDot = -Infinity

  for (const def of faceDefs) {
    const worldNormal = def.normal.clone().applyQuaternion(quaternion)
    const dot = worldNormal.dot(worldUp)
    if (dot > bestDot) {
      bestDot = dot
      bestValue = def.faceValue
    }
  }

  return bestValue
}

// ════════════════════════════════════════════
// 批量判定
// ════════════════════════════════════════════

export function getUpFaces(quaternions: THREE.Quaternion[], sides: number): number[] {
  return quaternions.map((q) => getUpFace(q, sides))
}