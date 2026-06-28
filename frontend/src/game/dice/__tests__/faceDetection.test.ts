import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { getUpFace } from '../faceDetection'

describe('getUpFace', () => {
  it('identity 四元数 d6 朝上=1（+Y 面）', () => {
    const result = getUpFace(new THREE.Quaternion(), 6)
    expect(result).toBe(1)
  })

  it('绕 X 轴翻转 180° d6 朝上=6（-Y 面）', () => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
    const result = getUpFace(q, 6)
    expect(result).toBe(6)
  })

  it('d20 identity 朝上=1', () => {
    const result = getUpFace(new THREE.Quaternion(), 20)
    expect(result).toBe(1)
  })

  it('d20 翻转后朝上值对应面 19（X 轴翻转不产生精确对面）', () => {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
    const result = getUpFace(q, 20)
    expect(result).toBe(19)
  })

  it('不支持的面数抛错', () => {
    expect(() => getUpFace(new THREE.Quaternion(), 4)).toThrow(/不支持/)
  })
})