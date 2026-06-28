// 预设落点——目标四元数计算 + slerp 校准
// 依赖 Three.js 数学类型，不依赖场景/渲染器。
// 策略：物理仿真无法精确保证落点，采用"物理滚动→静止→slerp 校准"双阶段。

import * as THREE from 'three'
import { DICE_FACE_DEFS } from './geometry'

// ════════════════════════════════════════════
// 目标四元数：使指定面朝上
// ════════════════════════════════════════════

export function getTargetQuaternion(sides: number, targetFaceValue: number): THREE.Quaternion {
  const faceDefs = DICE_FACE_DEFS[sides]
  if (!faceDefs) {
    throw new Error(`不支持的骰子面数: ${sides}`)
  }
  const faceDef = faceDefs.find((f) => f.faceValue === targetFaceValue)
  if (!faceDef) {
    throw new Error(`面值 ${targetFaceValue} 不存在于 d${sides}`)
  }
  const worldUp = new THREE.Vector3(0, 1, 0)
  return new THREE.Quaternion().setFromUnitVectors(faceDef.normal.clone().normalize(), worldUp)
}

// ════════════════════════════════════════════
// 批量计算
// ════════════════════════════════════════════

export function getTargetQuaternions(sides: number, targetValues: number[]): THREE.Quaternion[] {
  return targetValues.map((v) => getTargetQuaternion(sides, v))
}

// ════════════════════════════════════════════
// slerp 校准：平滑旋转骰子到目标朝向
// ════════════════════════════════════════════

export function correctDiceOrientation(
  mesh: THREE.Mesh,
  targetQuaternion: THREE.Quaternion,
  durationMs: number,
  onComplete: () => void,
): void {
  const startQuaternion = mesh.quaternion.clone()
  const startTime = performance.now()

  function animate() {
    const elapsed = performance.now() - startTime
    const t = Math.min(elapsed / durationMs, 1)
    mesh.quaternion.copy(startQuaternion).slerp(targetQuaternion, t)
    if (t < 1) {
      requestAnimationFrame(animate)
    } else {
      mesh.quaternion.copy(targetQuaternion)
      onComplete()
    }
  }

  requestAnimationFrame(animate)
}