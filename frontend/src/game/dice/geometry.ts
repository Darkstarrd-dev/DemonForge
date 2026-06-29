// 骰子几何体、面贴图与面定义表
// 依赖 Three.js 的数学类型（Vector3/BufferGeometry 等），不依赖场景/渲染器。
// DICE_FACE_DEFS 为 faceDetection 与 presets 提供核心数据。

import * as THREE from 'three'
import type { DiceThemeColors } from './types'

// ════════════════════════════════════════════
// 黄金比例常数
// ════════════════════════════════════════════

const PHI = (1 + Math.sqrt(5)) / 2 // φ ≈ 1.618
const INV_PHI = 1 / PHI // φ⁻¹ ≈ 0.618

// ════════════════════════════════════════════
// 面定义
// ════════════════════════════════════════════

export interface DiceFaceDef {
  normal: THREE.Vector3
  faceValue: number
}

function v(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z).normalize()
}

// 各多面体面法向量来源（数学标准坐标）：
// d6: 立方体六面 ±X/±Y/±Z 单位向量
// d8: 正八面体八面 (±1,±1,±1) 归一化
// d10: 五角双锥（pentagonal trapezohedron），上下各5面，
//      法向量绕 Y 轴每 72° 一面，倾斜角 arctan(1/2)≈26.57°
// d12: 正十二面体，法向量取 12 个五边形面心
//      （(0,±1/φ,±φ) 与 (±1/φ,±φ,0) 与 (±φ,0,±1/φ) 组合）
// d20: 正二十面体，法向量取 20 个三角形面心
//      （(±1,±1,±1) 与 (0,±1/φ,±φ) 与 (±1/φ,±φ,0) 与 (±φ,0,±1/φ) 组合）

export const DICE_FACE_DEFS: Record<number, DiceFaceDef[]> = {
  // d6: 六面立方体，对面之和=7
  // +Y=1, -Y=6; +Z=2, -Z=5; +X=3, -X=4
  6: [
    { normal: v(0, 1, 0), faceValue: 1 },
    { normal: v(0, -1, 0), faceValue: 6 },
    { normal: v(0, 0, 1), faceValue: 2 },
    { normal: v(0, 0, -1), faceValue: 5 },
    { normal: v(1, 0, 0), faceValue: 3 },
    { normal: v(-1, 0, 0), faceValue: 4 },
  ],

  // d8: 八面正八面体，对面之和=9
  // 8 种符号组合 (±1,±1,±1) 归一化
  8: [
    { normal: v(1, 1, 1), faceValue: 1 },
    { normal: v(1, 1, -1), faceValue: 2 },
    { normal: v(1, -1, 1), faceValue: 3 },
    { normal: v(1, -1, -1), faceValue: 4 },
    { normal: v(-1, 1, 1), faceValue: 5 },
    { normal: v(-1, 1, -1), faceValue: 6 },
    { normal: v(-1, -1, 1), faceValue: 7 },
    { normal: v(-1, -1, -1), faceValue: 8 },
  ],

  // d10: 五角双锥 10 面，对面之和=11
  // 上 5 面（法向量 y>0）+ 下 5 面（法向量 y<0），倾斜角 26.57°
  10: (() => {
    const cosA = Math.cos(Math.atan(1 / 2))
    const sinA = Math.sin(Math.atan(1 / 2))
    const faces: DiceFaceDef[] = []
    // 上 5 面，φ=0°,72°,144°,216°,288°
    const upperValues = [1, 3, 5, 7, 9]
    for (let i = 0; i < 5; i++) {
      const phi = (i * 72 * Math.PI) / 180
      faces.push({
        normal: v(cosA * Math.cos(phi), sinA, cosA * Math.sin(phi)),
        faceValue: upperValues[i],
      })
    }
    // 下 5 面，φ=36°,108°,180°,252°,324°
    const lowerValues = [4, 2, 10, 8, 6]
    for (let i = 0; i < 5; i++) {
      const phi = ((i * 72 + 36) * Math.PI) / 180
      faces.push({
        normal: v(cosA * Math.cos(phi), -sinA, cosA * Math.sin(phi)),
        faceValue: lowerValues[i],
      })
    }
    return faces
  })(),

  // d12: 正十二面体 12 面，对面之和=13
  // 12 个法向量 = 正二十面体顶点方向
  // (0,±1,±φ), (±1,±φ,0), (±φ,0,±1) 共 12 个
  12: (() => {
    const raw: [number, number, number][] = [
      [0, 1, PHI], [0, 1, -PHI], [1, PHI, 0], [1, -PHI, 0],
      [PHI, 0, 1], [PHI, 0, -1], [0, -1, -PHI], [0, -1, PHI],
      [-1, -PHI, 0], [-1, PHI, 0], [-PHI, 0, -1], [-PHI, 0, 1],
    ]
    const values = [1, 2, 3, 4, 5, 6, 12, 11, 10, 9, 8, 7]
    return raw.map(([x, y, z], i) => ({
      normal: v(x, y, z),
      faceValue: values[i],
    }))
  })(),

  // d20: 正二十面体 20 面，对面之和=21
  // 20 个法向量 = 正十二面体顶点方向，按 y 分量降序排列
  20: (() => {
    const raw: [number, number, number][] = [
      [INV_PHI, PHI, 0], [-INV_PHI, PHI, 0],
      [1, 1, 1], [1, 1, -1], [-1, 1, 1], [-1, 1, -1],
      [0, INV_PHI, PHI], [0, INV_PHI, -PHI],
      [PHI, 0, INV_PHI], [PHI, 0, -INV_PHI],
      [-PHI, 0, -INV_PHI], [-PHI, 0, INV_PHI],
      [0, -INV_PHI, PHI], [0, -INV_PHI, -PHI],
      [1, -1, 1], [1, -1, -1], [-1, -1, 1], [-1, -1, -1],
      [INV_PHI, -PHI, 0], [-INV_PHI, -PHI, 0],
    ]
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 11, 13, 14, 15, 16, 17, 18, 19, 20]
    return raw.map(([x, y, z], i) => ({
      normal: v(x, y, z),
      faceValue: values[i],
    }))
  })(),
}

// ════════════════════════════════════════════
// 几何体工厂
// ════════════════════════════════════════════

export function createDiceGeometry(sides: number, size: number): THREE.BufferGeometry {
  switch (sides) {
    case 6: {
      // BoxGeometry 自带 6 个 group（每面一个），materialIndex 0-5
      // 面顺序: +X, -X, +Y, -Y, +Z, -Z
      return new THREE.BoxGeometry(size, size, size)
    }
    case 8: {
      const geo = ensureNonIndexed(new THREE.OctahedronGeometry(size))
      // 8 个三角形面，每面 3 顶点 → 24 顶点
      addFaceGroups(geo, 8, 3)
      return geo
    }
    case 10: {
      return createD10Geometry(size)
    }
    case 12: {
      const geo = ensureNonIndexed(new THREE.DodecahedronGeometry(size))
      // 12 个五边形面，每面 3 三角形 → 12×9 顶点
      addFaceGroups(geo, 12, 9)
      return geo
    }
    case 20: {
      const geo = ensureNonIndexed(new THREE.IcosahedronGeometry(size))
      // 20 个三角形面，每面 3 顶点 → 60 顶点
      addFaceGroups(geo, 20, 3)
      return geo
    }
    default:
      throw new Error(`不支持的骰子面数: ${sides}`)
  }
}

// 为 non-indexed 几何体添加 per-face groups
function addFaceGroups(geo: THREE.BufferGeometry, faceCount: number, vertsPerFace: number): void {
  geo.clearGroups()
  for (let i = 0; i < faceCount; i++) {
    geo.addGroup(i * vertsPerFace, vertsPerFace, i)
  }
}

// 仅当几何体有 index 时才转为 non-indexed（保留 groups），否则直接返回
function ensureNonIndexed(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geo.index) {
    return geo.toNonIndexed()
  }
  return geo
}

// d10 五角双锥——手写 BufferGeometry（唯一不能用 Three.js 内置几何体的骰子）
function createD10Geometry(size: number): THREE.BufferGeometry {
  // 顶点：顶极点 + 底极点 + 上环 5 点 + 下环 5 点（共 12 顶点）
  const ringY = size * 0.5
  const ringR = size
  const poleY = size * 1.5

  const positions: number[] = []
  // 顶极点 index 0
  positions.push(0, poleY, 0)
  // 底极点 index 1
  positions.push(0, -poleY, 0)

  // 上环 5 点 (index 2-6)，φ = 0°, 72°, 144°, 216°, 288°
  for (let i = 0; i < 5; i++) {
    const phi = (i * 72 * Math.PI) / 180
    positions.push(ringR * Math.cos(phi), ringY, ringR * Math.sin(phi))
  }

  // 下环 5 点 (index 7-11)，φ = 36°, 108°, 180°, 252°, 324°
  for (let i = 0; i < 5; i++) {
    const phi = ((i * 72 + 36) * Math.PI) / 180
    positions.push(ringR * Math.cos(phi), -ringY, ringR * Math.sin(phi))
  }

  // 面索引：10 个 kite 面，每个拆为 2 个三角形 = 20 三角形
  // 面 k 的 kite: upper[k], lower[k], lower[k+1], upper[k+1]
  // 三角 1: upper[k], lower[k], lower[k+1]
  // 三角 2: upper[k], lower[k+1], upper[k+1]
  const indices: number[] = []
  for (let k = 0; k < 5; k++) {
    const u0 = 2 + k // upper ring index
    const u1 = 2 + ((k + 1) % 5)
    const l0 = 7 + k // lower ring index
    const l1 = 7 + ((k + 1) % 5)

    // 三角 1
    indices.push(u0, l0, l1)
    // 三角 2
    indices.push(u0, l1, u1)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()

  // 添加 groups：10 个面，每个 6 个索引（2 个三角形），materialIndex 0-9
  geo.clearGroups()
  for (let i = 0; i < 10; i++) {
    geo.addGroup(i * 6, 6, i)
  }

  return geo
}

// ════════════════════════════════════════════
// 面贴图生成器
// ════════════════════════════════════════════

export function createDiceFaceTextures(
  sides: number,
  theme: DiceThemeColors,
): Map<number, THREE.CanvasTexture> {
  const textures = new Map<number, THREE.CanvasTexture>()
  for (let faceValue = 1; faceValue <= sides; faceValue++) {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')!
    // 底色
    ctx.fillStyle = theme.face
    ctx.fillRect(0, 0, 128, 128)
    // 边框
    ctx.strokeStyle = theme.edge
    ctx.lineWidth = 4
    ctx.strokeRect(2, 2, 124, 124)
    // 点数数字居中
    ctx.fillStyle = theme.pip
    ctx.font = 'bold 64px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(faceValue), 64, 64)

    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    textures.set(faceValue, tex)
  }
  return textures
}

// ════════════════════════════════════════════
// 面贴图应用
// ════════════════════════════════════════════

// d6 BoxGeometry 的 group→faceValue 映射表
// group 顺序: +X(0), -X(1), +Y(2), -Y(3), +Z(4), -Z(5)
const D6_GROUP_TO_FACE: Record<number, number> = {
  0: 3, // +X → faceValue 3
  1: 4, // -X → faceValue 4
  2: 1, // +Y → faceValue 1
  3: 6, // -Y → faceValue 6
  4: 2, // +Z → faceValue 2
  5: 5, // -Z → faceValue 5
}

// d8/d10/d12/d20 的 group→faceValue 通过几何法向量匹配确定

export function applyFaceTextures(
  geometry: THREE.BufferGeometry,
  sides: number,
  textures: Map<number, THREE.CanvasTexture>,
  faceDefs: DiceFaceDef[],
): THREE.Material[] {
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute
  const groups = geometry.groups
  const faceDefMap = new Map(faceDefs.map((d) => [d.faceValue, d.normal]))

  if (sides === 6) {
    // d6: 直接使用 BoxGeometry 的 group→face 映射
    const materials: THREE.Material[] = []
    for (let gi = 0; gi < 6; gi++) {
      const faceValue = D6_GROUP_TO_FACE[gi]
      const tex = textures.get(faceValue)
      materials.push(new THREE.MeshStandardMaterial({ map: tex }))
    }
    return materials
  }



  // d8/d10/d12/d20: 每个 group 对应一个面，直接匹配
  const materials: THREE.Material[] = []
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]
    const faceValue = matchFaceNormal(posAttr, g.start!, faceDefMap)
    // 更新 materialIndex 为 gi
    geometry.groups[gi] = { start: g.start!, count: g.count!, materialIndex: gi }
    const tex = textures.get(faceValue)
    materials.push(new THREE.MeshStandardMaterial({ map: tex }))
  }
  return materials
}

// 从几何体顶点法向量匹配最近的面定义
function matchFaceNormal(
  posAttr: THREE.BufferAttribute,
  startIndex: number,
  faceDefMap: Map<number, THREE.Vector3>,
): number {
  const a = new THREE.Vector3().fromBufferAttribute(posAttr, startIndex)
  const b = new THREE.Vector3().fromBufferAttribute(posAttr, startIndex + 1)
  const c = new THREE.Vector3().fromBufferAttribute(posAttr, startIndex + 2)
  const edge1 = new THREE.Vector3().subVectors(b, a)
  const edge2 = new THREE.Vector3().subVectors(c, a)
  const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize()

  let bestValue = 1
  let bestDot = -Infinity
  for (const [faceValue, defNormal] of faceDefMap) {
    const dot = normal.dot(defNormal)
    if (dot > bestDot) {
      bestDot = dot
      bestValue = faceValue
    }
  }
  return bestValue
}