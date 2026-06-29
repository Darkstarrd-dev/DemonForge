import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { GameState } from '../../game/monopoly/types'
import { SpaceType } from '../../game/monopoly/types'
import { groupColor } from '../../game/monopoly/engine/loader'

// 3D 渲染适配层：复用同一 GameState（经 stateRef 读取），不含任何游戏逻辑。
// 棋盘格沿 tile.coord 环形铺开；棋子随 player.position 平滑移动；地产升起业主色柱（高随等级）。

const CELL = 2 // 单格世界尺寸

function tileToWorld(coord: { row: number; col: number }, side: number): [number, number] {
  const center = (side + 1) / 2
  return [(coord.col - center) * CELL, (coord.row - center) * CELL]
}

function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

export default function Board3D({ state }: { state: GameState }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef(state)

  // 每次 state 变化同步到 ref，供 animate 循环读取最新值（避免重建场景）
  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const width = el.clientWidth
    const height = el.clientHeight
    if (width < 10 || height < 10) return

    let stopped = false
    let animId = 0

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a2e)

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 500)
    camera.position.set(0, 24, 22)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(window.devicePixelRatio)
    el.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.update()

    scene.add(new THREE.AmbientLight(0xffffff, 1.4))
    const dir = new THREE.DirectionalLight(0xffffff, 1.6)
    dir.position.set(12, 20, 8)
    scene.add(dir)

    const board = stateRef.current.board

    // 计算 grid 边长（从 tile coord 取最大值）
    let side = 11
    for (const t of board.tiles) {
      if (t.coord.row > side) side = t.coord.row
      if (t.coord.col > side) side = t.coord.col
    }

    // 棋盘格（静态）+ 地产柱（动态，存 ref）
    const propPillars = new Map<string, THREE.Mesh>()
    for (const tile of board.tiles) {
      const [x, z] = tileToWorld(tile.coord, side)
      const isProp = tile.type === SpaceType.PROPERTY
      const baseColor = isProp && tile.groupId ? hexToInt(groupColor(tile.groupId) ?? '#3a3a55') : 0x3a3a55
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(CELL * 0.92, 0.3, CELL * 0.92),
        new THREE.MeshStandardMaterial({ color: baseColor }),
      )
      plate.position.set(x, 0, z)
      scene.add(plate)

      if (isProp) {
        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(CELL * 0.5, 1, CELL * 0.5),
          new THREE.MeshStandardMaterial({ color: 0xffffff }),
        )
        pillar.position.set(x, 0, z)
        pillar.visible = false
        scene.add(pillar)
        propPillars.set(tile.id, pillar)
      }
    }

    // 棋子（玩家）
    const pawns = new Map<string, THREE.Mesh>()
    stateRef.current.players.forEach((p) => {
      const pawn = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.42, 1.2, 18),
        new THREE.MeshStandardMaterial({ color: hexToInt(p.color) }),
      )
      pawn.position.set(0, 0.8, 0)
      scene.add(pawn)
      pawns.set(p.id, pawn)
    })

    const animate = () => {
      if (stopped) return
      const st = stateRef.current

      // 棋子：lerp 到目标格（同格多子小偏移）
      st.players.forEach((p, i) => {
        const pawn = pawns.get(p.id)
        if (!pawn) return
        const tile = st.board.tiles.find(t => t.id === p.position)
        if (!tile) return
        const [tx, tz] = tileToWorld(tile.coord, side)
        const ox = (i % 2) * 0.6 - 0.3
        const oz = Math.floor(i / 2) * 0.6 - 0.3
        pawn.position.x += (tx + ox - pawn.position.x) * 0.15
        pawn.position.z += (tz + oz - pawn.position.z) * 0.15
        pawn.visible = !p.bankrupt
      })

      // 地产柱：业主色 + 高度随等级 + 抵押半透明
      propPillars.forEach((pillar, tid) => {
        const prop = st.board.properties[tid]
        const mat = pillar.material as THREE.MeshStandardMaterial
        if (prop && prop.ownerId) {
          const owner = st.players.find((pl) => pl.id === prop.ownerId)
          const h = 0.6 + prop.level * 0.6
          pillar.visible = true
          pillar.scale.y = h
          pillar.position.y = h / 2
          mat.color.set(owner ? hexToInt(owner.color) : 0xffffff)
          mat.transparent = prop.mortgaged
          mat.opacity = prop.mortgaged ? 0.35 : 1
        } else {
          pillar.visible = false
        }
      })

      controls.update()
      renderer.render(scene, camera)
      if (!stopped) animId = requestAnimationFrame(animate)
    }

    const onResize = () => {
      if (stopped || !containerRef.current) return
      const w = containerRef.current.clientWidth
      const h = containerRef.current.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    animate()

    return () => {
      stopped = true
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      renderer.dispose()
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          ;(obj.material as THREE.Material).dispose()
        }
      })
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
    }
    // 仅挂载一次；state 经 stateRef 进入 animate 循环
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#1a1a2e' }} />
}
