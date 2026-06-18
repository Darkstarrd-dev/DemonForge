import { useEffect, useRef } from 'react'
import { Button, Space, Card, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import RAPIER from '@dimforge/rapier3d-compat'

function randomQuaternion() {
  const u1 = Math.random()
  const u2 = Math.random() * Math.PI * 2
  const u3 = Math.random() * Math.PI * 2
  const sq = Math.sqrt(1 - u1)
  const sq2 = Math.sqrt(u1)
  return { x: sq * Math.sin(u2), y: sq * Math.cos(u2), z: sq2 * Math.sin(u3), w: sq2 * Math.cos(u3) }
}

const COLORS = [0xe94560, 0x533483, 0x4ac0c0, 0xf5a623, 0x7bed9f, 0xff6b81, 0x70a1ff]
let rapierReady = false

export default function Demo3DPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<{ stop: () => void } | null>(null)

  const startEngine = () => {
    const el = containerRef.current
    if (!el || !rapierReady) return
    el.innerHTML = ''

    let stopped = false
    let animId = 0

    const width = el.clientWidth
    const height = el.clientHeight

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
      animId = requestAnimationFrame(animate)

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
    }

    for (let i = 0; i < 15; i++) spawnCube()
    animate()

    const onResize = () => {
      if (stopped || !containerRef.current) return
      const w2 = containerRef.current.clientWidth
      const h2 = containerRef.current.clientHeight
      camera.aspect = w2 / h2
      camera.updateProjectionMatrix()
      renderer.setSize(w2, h2)
    }
    window.addEventListener('resize', onResize)

    engineRef.current = {
      stop: () => {
        stopped = true
        cancelAnimationFrame(animId)
        window.removeEventListener('resize', onResize)
        controls.dispose()
        renderer.dispose()
        for (const c of cubes) {
          c.mesh.geometry.dispose()
          ;(c.mesh.material as THREE.MeshStandardMaterial).dispose()
        }
        world.free()
        if (renderer.domElement.parentNode === el) {
          el.removeChild(renderer.domElement)
        }
        engineRef.current = null
      },
    }
  }

  useEffect(() => {
    const init = async () => {
      if (!rapierReady) {
        await RAPIER.init()
        rapierReady = true
      }
      startEngine()
    }
    init()
    return () => {
      engineRef.current?.stop()
    }
  }, [])

  const handleReset = () => {
    engineRef.current?.stop()
    startEngine()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <Card size="small">
        <Space>
          <Typography.Text strong>3D 刚体演示</Typography.Text>
          <Typography.Text type="secondary">Three.js + Rapier3D · 鼠标拖拽旋转视角</Typography.Text>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>复位</Button>
        </Space>
      </Card>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, borderRadius: 8, overflow: 'hidden', background: '#1a1a2e' }} />
    </div>
  )
}
