import { describe, it, expect } from 'vitest'
import { getTargetQuaternion } from '../presets'
import { getUpFace } from '../faceDetection'

describe('getTargetQuaternion', () => {
  it('getTargetQuaternion(6,1) 使 face 1 朝上', () => {
    const q = getTargetQuaternion(6, 1)
    const result = getUpFace(q, 6)
    expect(result).toBe(1)
  })

  it('getTargetQuaternion(6,6) 使 face 6 朝上', () => {
    const q = getTargetQuaternion(6, 6)
    const result = getUpFace(q, 6)
    expect(result).toBe(6)
  })

  it('getTargetQuaternion(20,17) 使 face 17 朝上', () => {
    const q = getTargetQuaternion(20, 17)
    const result = getUpFace(q, 20)
    expect(result).toBe(17)
  })

  it('getTargetQuaternion(20,1) 使 face 1 朝上', () => {
    const q = getTargetQuaternion(20, 1)
    const result = getUpFace(q, 20)
    expect(result).toBe(1)
  })
})