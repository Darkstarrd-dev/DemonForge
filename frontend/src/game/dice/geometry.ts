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

  // d10: 五角双锥（pentagonal bipyramid）10 面，对面之和=11
  // 5 上 + 5 下三角面，法向量倾斜角由双锥比例决定
  // 双锥上下面法向量在同一组 φ 角（36°+72°*i），仅 y 分量正负不同
  10: (() => {
    const R = 0.7
    const H = 1
    const sin72 = Math.sin(72 * Math.PI / 180)
    const cos72 = Math.cos(72 * Math.PI / 180)
    const nx0 = H * R * sin72
    const ny0 = R * R * sin72
    const nz0 = R * H * (1 - cos72)
    const mag = Math.sqrt(nx0 * nx0 + ny0 * ny0 + nz0 * nz0)
    const unx = nx0 / mag
    const uny = ny0 / mag
    const unz = nz0 / mag
    const faces: DiceFaceDef[] = []
    const upperValues = [1, 3, 5, 7, 9]
    const lowerValues = [10, 8, 6, 4, 2]
    for (let i = 0; i < 5; i++) {
      const rot = (i * 72 * Math.PI) / 180
      const cosR = Math.cos(rot)
      const sinR = Math.sin(rot)
      faces.push({
        normal: v(unx * cosR + unz * sinR, uny, -unx * sinR + unz * cosR),
        faceValue: upperValues[i],
      })
      faces.push({
        normal: v(unx * cosR + unz * sinR, -uny, -unx * sinR + unz * cosR),
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

// d10 五角双锥——7 顶点（2 极 + 5 环），10 三角面
function createD10Geometry(size: number): THREE.BufferGeometry {
  const R = size * 0.7
  const H = size

  const topPole = [0, H, 0]
  const bottomPole = [0, -H, 0]
  const eqVerts: number[][] = []
  for (let i = 0; i < 5; i++) {
    const phi = (i * 72 * Math.PI) / 180
    eqVerts.push([R * Math.cos(phi), 0, R * Math.sin(phi)])
  }

  const positions: number[] = []
  for (let i = 0; i < 5; i++) {
    const e0 = eqVerts[i]
    const e1 = eqVerts[(i + 1) % 5]
    // Upper face: top, e1, e0（外法向量 y>0）
    positions.push(...topPole, ...e1, ...e0)
    // Lower face: bottom, e0, e1（外法向量 y<0）
    positions.push(...bottomPole, ...e0, ...e1)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()

  geo.clearGroups()
  for (let i = 0; i < 10; i++) {
    geo.addGroup(i * 3, 3, i)
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