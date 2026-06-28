import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import RAPIER from '@dimforge/rapier3d-compat'
import {
  DiceRoller,
  createDiceGeometry,
  createDiceFaceTextures,
  applyFaceTextures,
  DICE_FACE_DEFS,
} from '../../game/dice'
import type { DiceThemeColors } from '../../game/dice'

const DEFAULT_THEME: DiceThemeColors = { face: '#FFFFFF', pip: '#000000', edge: '#333333' }

interface Dice3DParams {
  count: number
  sides: number
}

export function createDice3DEngine(
  container: HTMLElement,
  params: Dice3DParams,
) {
  let stopped = false
  let animId = 0
  const roller = new DiceRoller()
  const meshes: THREE.Mesh[] = []
  const bodies: RAPIER.RigidBody[] = []

  const width = container.clientWidth
  const height = container.clientHeight
  if (width < 10 || height < 10) return { stop: () => {}, roll: async () => [] }

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a2e)

  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 200)
  camera.position.set(0, 8, 15)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.shadowMap.enabled = true
  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 1, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.update()

  scene.add(new THREE.AmbientLight(0x404060, 1.5))
  const dirLight = new THREE.DirectionalLight(0xffffff, 2)
  dirLight.position.set(10, 20, 10)
  dirLight.castShadow = true
  dirLight.shadow.mapSize.set(1024, 1024)
  scene.add(dirLight)

  // 地面
  const floorGeo = new THREE.PlaneGeometry(20, 20)
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2a4e, roughness: 0.8 })
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  // Rapier 世界
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  world.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.1, 10), floorBody)

  // 纹理缓存
  const textures = createDiceFaceTextures(params.sides, DEFAULT_THEME)

  const animate = () => {
    if (stopped) return
    try {
      world.step()
      for (let i = 0; i < meshes.length; i++) {
        const t = bodies[i].translation()
        const r = bodies[i].rotation()
        meshes[i].position.set(t.x, t.y, t.z)
        meshes[i].quaternion.set(r.x, r.y, r.z, r.w)
      }
      controls.update()
      renderer.render(scene, camera)
    } catch {
      stopped = true
      return
    }
    animId = requestAnimationFrame(animate)
  }
  animId = requestAnimationFrame(animate)

  const roll = async (presetValues?: number[]): Promise<number[]> => {
    const result = roller.roll({ count: params.count, sides: params.sides as never, presetValues })

    // 清理旧骰子
    for (const mesh of meshes) {
      scene.remove(mesh)
      mesh.geometry.dispose()
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => (m as THREE.Material).dispose())
      } else {
        ;(mesh.material as THREE.Material).dispose()
      }
    }
    for (const body of bodies) {
      world.removeRigidBody(body)
    }
    meshes.length = 0
    bodies.length = 0

    // 创建新骰子
    const spacing = Math.min(2, 8 / Math.max(params.count, 1))
    const startX = -(params.count - 1) * spacing / 2

    for (let i = 0; i < params.count; i++) {
      const geo = createDiceGeometry(params.sides, 0.6)
      const faceDefs = DICE_FACE_DEFS[params.sides]
      const materials = applyFaceTextures(geo, params.sides, textures, faceDefs)
      const mesh = new THREE.Mesh(geo, materials)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.position.set(startX + i * spacing, 6 + Math.random() * 2, (Math.random() - 0.5) * 2)
      mesh.quaternion.set(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      )
      mesh.quaternion.normalize()
      scene.add(mesh)
      meshes.push(mesh)

      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
      const body = world.createRigidBody(bodyDesc)
      const collider = RAPIER.ColliderDesc.ball(0.5)
        .setRestitution(0.5)
        .setFriction(0.6)
      world.createCollider(collider, body)
      body.applyImpulse(
        { x: (Math.random() - 0.5) * 3, y: -2 - Math.random() * 3, z: (Math.random() - 0.5) * 3 },
        true,
      )
      body.applyTorqueImpulse(
        { x: (Math.random() - 0.5) * 10, y: (Math.random() - 0.5) * 10, z: (Math.random() - 0.5) * 10 },
        true,
      )
      bodies.push(body)
    }

    return result.values
  }

  const stop = () => {
    stopped = true
    cancelAnimationFrame(animId)
    for (const mesh of meshes) {
      mesh.geometry.dispose()
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => (m as THREE.Material).dispose())
      } else {
        ;(mesh.material as THREE.Material).dispose()
      }
    }
    for (const body of bodies) world.removeRigidBody(body)
    world.free()
    renderer.dispose()
    controls.dispose()
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement)
    }
    container.innerHTML = ''
  }

  return { stop, roll }
}