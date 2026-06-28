import { useEffect, useRef, useState, useCallback } from 'react'
import { Button, Select, Space, App } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import RAPIER from '@dimforge/rapier3d-compat'
import { ensureRapierReady } from '../../game/physics/rapierInit'
import { createDice3DEngine } from './Dice3DEngine'
import Dice3DPanel from './Dice3DPanel'
import type { DiceSideValue, DiceThemeColors, DicePhysicsParams } from '../../game/dice'

function randomQuaternion() {
  const u1 = Math.random()
  const u2 = Math.random() * Math.PI * 2
  const u3 = Math.random() * Math.PI * 2
  const sq = Math.sqrt(1 - u1)
  const sq2 = Math.sqrt(u1)
  return { x: sq * Math.sin(u2), y: sq * Math.cos(u2), z: sq2 * Math.sin(u3), w: sq2 * Math.cos(u3) }
}

const COLORS = [0xe94560, 0x533483, 0x4ac0c0, 0xf5a623, 0x7bed9f, 0xff6b81, 0x70a1ff]

type DiceEngineHandle = { stop: () => void; roll: (presetValues?: number[]) => Promise<number[]> }

export default function Demo3DPage() {
  const { message } = App.useApp()
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<DiceEngineHandle | { stop: () => void } | null>(null)
  const [sceneType, setSceneType] = useState<'rigid' | 'dice'>('rigid')
  const [diceResult, setDiceResult] = useState<{ values: number[]; total: number } | null>(null)
  const [diceRolling, setDiceRolling] = useState(false)

  const [diceCount, setDiceCount] = useState(2)
  const [diceSides, setDiceSides] = useState<DiceSideValue>(6)
  const [diceTheme, setDiceTheme] = useState<DiceThemeColors>({ face: '#FFFFFF', pip: '#000000', edge: '#333333' })
  const [dicePhysics, setDicePhysics] = useState<DicePhysicsParams>({
    friction: 0.6,
    restitution: 0.5,
    gravity: 9.81,
    throwForce: 15,
    spinForce: 10,
  })

  const startEngine = () => {
    const el = containerRef.current
    if (!el) return
    el.innerHTML = ''

    let stopped = false
    let animId = 0

    const width = el.clientWidth
    const height = el.clientHeight
    if (width < 10 || height < 10) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a2e)

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 200)
    camera.position.set(0, 12, 25)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    el.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 3, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.update()

    scene.add(new THREE.AmbientLight(0x404060, 1.5))

    const dirLight = new THREE.DirectionalLight(0xffffff, 2)
    dirLight.position.set(10, 20, 10)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.set(1024, 1024)
    dirLight.shadow.camera.left = -20
    dirLight.shadow.camera.right = 20
    dirLight.shadow.camera.top = 20
    dirLight.shadow.camera.bottom = -20
    scene.add(dirLight)

    const pointLight = new THREE.PointLight(0x4488ff, 1, 50)
    pointLight.position.set(-5, 10, 5)
    scene.add(pointLight)

    const floorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(30, 0.5, 30),
      new THREE.MeshStandardMaterial({ color: 0x16213e }),
    )
    floorMesh.position.set(0, -0.25, 0)
    floorMesh.receiveShadow = true
    scene.add(floorMesh)

    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })

    const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.25, 0))
    world.createCollider(RAPIER.ColliderDesc.cuboid(15, 0.25, 15).setRestitution(0.3).setFriction(0.8), floorBody)

    const wallData = [
      { p: [-15, 5, 0], s: [0.5, 10, 15] },
      { p: [15, 5, 0], s: [0.5, 10, 15] },
      { p: [0, 5, -15], s: [15, 10, 0.5] },
      { p: [0, 5, 15], s: [15, 10, 0.5] },
    ]
    for (const w of wallData) {
      const wb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(w.p[0], w.p[1], w.p[2]))
      world.createCollider(RAPIER.ColliderDesc.cuboid(w.s[0] / 2, w.s[1] / 2, w.s[2] / 2).setRestitution(0.5).setFriction(0.6), wb)
      const wm = new THREE.Mesh(
        new THREE.BoxGeometry(w.s[0] * 2, w.s[1] * 2, w.s[2] * 2),
        new THREE.MeshStandardMaterial({ color: 0x0f3460, transparent: true, opacity: 0.3 }),
      )
      wm.position.set(w.p[0], w.p[1], w.p[2])
      scene.add(wm)
    }

    const cubes: { body: RAPIER.RigidBody; mesh: THREE.Mesh }[] = []

    const spawnCube = () => {
      const sz = 0.6 + Math.random() * 0.8
      const color = COLORS[Math.floor(Math.random() * COLORS.length)]
      const rq = randomQuaternion()
      const desc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation((Math.random() - 0.5) * 20, 12 + Math.random() * 8, (Math.random() - 0.5) * 20)
        .setRotation(rq)
      const body = world.createRigidBody(desc)
      body.setLinvel({ x: (Math.random() - 0.5) * 4, y: -Math.random() * 2, z: (Math.random() - 0.5) * 4 }, true)
      body.setAngvel({ x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4, z: (Math.random() - 0.5) * 4 }, true)
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(sz / 2, sz / 2, sz / 2).setRestitution(0.4).setFriction(0.7).setDensity(2),
        body,
      )
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(sz, sz, sz),
        new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1 }),
      )
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)
      cubes.push({ body, mesh })
    }

    let frameCount = 0
    const animate = () => {
      if (stopped) return

      try {
        world.step()
        for (let i = cubes.length - 1; i >= 0; i--) {
          const { body, mesh } = cubes[i]
          const t = body.translation()
          const r = body.rotation()
          mesh.position.set(t.x, t.y, t.z)
          mesh.quaternion.set(r.x, r.y, r.z, r.w)
          if (t.y < -20) {
            scene.remove(mesh)
            mesh.geometry.dispose()
            ;(mesh.material as THREE.MeshStandardMaterial).dispose()
            world.removeRigidBody(body)
            cubes.splice(i, 1)
          }
        }

        frameCount++
        if (frameCount % 40 === 0 && cubes.length < 80) spawnCube()

        controls.update()
        renderer.render(scene, camera)
      } catch (err) {
        console.error('[Demo3D] 物理引擎帧异常，已停止循环:', err)
        stopInternal(true)
        return
      }

      if (!stopped) animId = requestAnimationFrame(animate)
    }

    const stopInternal = (fromError: boolean) => {
      if (stopped) return
      stopped = true
      cancelAnimationFrame(animId)
      animId = 0

      window.removeEventListener('resize', onResize)
      controls.dispose()
      renderer.dispose()
      for (const c of cubes) {
        c.mesh.geometry.dispose()
        ;(c.mesh.material as THREE.MeshStandardMaterial).dispose()
      }
      try { world.free() } catch { /* 堆损坏忽略 */ }
      if (renderer.domElement.parentNode === el) {
        el.removeChild(renderer.domElement)
      }
      if (engineRef.current && engineRef.current.stop === stop) {
        engineRef.current = null
      }
      if (fromError) {
        message.error('3D 物理引擎遇到错误，已停止。点「复位」可重新开始。')
      }
    }

    const stop = () => stopInternal(false)
    void stop

    const onResize = () => {
      if (stopped || !containerRef.current) return
      const w2 = containerRef.current.clientWidth
      const h2 = containerRef.current.clientHeight
      camera.aspect = w2 / h2
      camera.updateProjectionMatrix()
      renderer.setSize(w2, h2)
    }
    window.addEventListener('resize', onResize)

    engineRef.current = { stop }

    for (let i = 0; i < 15; i++) spawnCube()
    animate()
  }

  const startDiceEngine = async () => {
    const el = containerRef.current
    if (!el) return
    try {
      const engine = await createDice3DEngine(el, {
        count: diceCount,
        sides: diceSides,
        theme: diceTheme,
        physics: dicePhysics,
      })
      engineRef.current = engine
    } catch (err) {
      console.error('[Demo3D] 骰子引擎创建失败:', err)
      message.error('骰子引擎创建失败')
    }
  }

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        await ensureRapierReady()
        if (cancelled) return
        if (sceneType === 'rigid') {
          startEngine()
        } else {
          startDiceEngine()
        }
      } catch (err) {
        console.error('[Demo3D] Rapier 初始化失败:', err)
        if (!cancelled) message.error('3D 物理引擎初始化失败')
      }
    }
    init()
    return () => {
      cancelled = true
      engineRef.current?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneType])

  const handleReset = async () => {
    engineRef.current?.stop()
    try {
      await ensureRapierReady()
    } catch (err) {
      console.error('[Demo3D] 复位时 Rapier 初始化失败:', err)
      message.error('3D 物理引擎初始化失败')
      return
    }
    if (sceneType === 'rigid') {
      startEngine()
    } else {
      startDiceEngine()
    }
  }

  const handleDiceRoll = useCallback(async (presetValues?: number[]) => {
    const diceEngine = engineRef.current as DiceEngineHandle | null
    if (!diceEngine?.roll) return
    setDiceRolling(true)
    setDiceResult(null)
    try {
      const values = await diceEngine.roll(presetValues)
      const total = values.reduce((a, b) => a + b, 0)
      setDiceResult({ values, total })
    } catch (err) {
      console.error('[Demo3D] 骰子投掷失败:', err)
    }
    setDiceRolling(false)
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#1a1a2e' }} />
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 1000,
          background: 'rgba(255, 255, 255, 0.9)',
          borderRadius: 8,
          padding: '8px 12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        <Space direction="vertical" size={8}>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>复位</Button>
          <Select
            value={sceneType}
            onChange={(v) => {
              setSceneType(v)
              setDiceResult(null)
            }}
            style={{ width: 140 }}
            options={[
              { value: 'rigid', label: '刚体碰撞演示' },
              { value: 'dice', label: '骰子演示' },
            ]}
          />
          {sceneType === 'dice' && (
            <Dice3DPanel
              count={diceCount}
              sides={diceSides}
              theme={diceTheme}
              physics={dicePhysics}
              onCountChange={setDiceCount}
              onSidesChange={(v) => setDiceSides(v as DiceSideValue)}
              onThemeChange={setDiceTheme}
              onPhysicsChange={setDicePhysics}
              onRoll={handleDiceRoll}
              rolling={diceRolling}
              lastResult={diceResult ?? undefined}
            />
          )}
        </Space>
      </div>
    </div>
  )
}
