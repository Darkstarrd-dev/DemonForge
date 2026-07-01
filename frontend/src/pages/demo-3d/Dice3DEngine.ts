import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import RAPIER from '@dimforge/rapier3d-compat'
import { ensureRapierReady } from '../../game/physics/rapierInit'
import {
  createDiceGeometry,
  createDiceFaceTextures,
  applyFaceTextures,
  DICE_FACE_DEFS,
  getUpFace,
  getTargetQuaternion,
  correctDiceOrientation,
} from '../../game/dice'
import type { DiceSideValue, DiceThemeColors, DicePhysicsParams } from '../../game/dice'

const DEFAULT_THEME: DiceThemeColors = { face: '#FFFFFF', pip: '#000000', edge: '#333333' }
const DEFAULT_PHYSICS: DicePhysicsParams = {
  friction: 0.6,
  restitution: 0.15,
  gravity: 9.81,
  throwForce: 15,
  spinForce: 8,
  dropHeight: 8,
}

interface Dice3DParams {
  count: number
  sides: DiceSideValue
  theme?: DiceThemeColors
  physics?: DicePhysicsParams
}

export async function createDice3DEngine(
  container: HTMLElement,
  params: Dice3DParams,
) {
  await ensureRapierReady()

  let stopped = false
  let animId = 0
  const meshes: THREE.Mesh[] = []
  const bodies: RAPIER.RigidBody[] = []
  const colliders: RAPIER.Collider[] = []
  let pendingRoll: {
    isPreset: boolean
    targetValues: number[] | null
    resolve: (values: number[]) => void
  } | null = null
  let settlingFrames = 0
  const SETTLING_THRESHOLD = 30
  const SETTLE_VELOCITY = 0.1

  const theme = params.theme ?? DEFAULT_THEME
  const physics = params.physics ?? DEFAULT_PHYSICS

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

  const floorGeo = new THREE.PlaneGeometry(20, 20)
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2a4e, roughness: 0.8 })
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const world = new RAPIER.World({ x: 0, y: -physics.gravity, z: 0 })
  const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(10, 0.1, 10)
      .setRestitution(physics.restitution)
      .setFriction(physics.friction),
    floorBody,
  )

  const wallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  const wallDefs = [
    { x: -10, y: 5, z: 0, hx: 0.5, hy: 5, hz: 10 },
    { x: 10, y: 5, z: 0, hx: 0.5, hy: 5, hz: 10 },
    { x: 0, y: 5, z: -10, hx: 10, hy: 5, hz: 0.5 },
    { x: 0, y: 5, z: 10, hx: 10, hy: 5, hz: 0.5 },
  ]
  for (const w of wallDefs) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(w.hx, w.hy, w.hz)
        .setTranslation(w.x, w.y, w.z)
        .setRestitution(0.1)
        .setFriction(physics.friction),
      wallBody,
    )
  }

  const textures = createDiceFaceTextures(params.sides, theme)

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

      if (pendingRoll) {
        for (let i = 0; i < bodies.length; i++) {
          const t = bodies[i].translation()
          if (t.y < -10) {
            const angle = (i / bodies.length) * Math.PI * 2
            bodies[i].setTranslation({ x: Math.cos(angle) * 2, y: physics.dropHeight + Math.random() * 0.5, z: Math.sin(angle) * 2 }, true)
            bodies[i].setLinvel({ x: 0, y: 0, z: 0 }, true)
            bodies[i].setAngvel({ x: 0, y: 0, z: 0 }, true)
          }
        }

        const allSettled = bodies.every((b) => {
          const lv = b.linvel()
          const av = b.angvel()
          return Math.hypot(lv.x, lv.y, lv.z) < SETTLE_VELOCITY
            && Math.hypot(av.x, av.y, av.z) < SETTLE_VELOCITY
        })
        if (allSettled) {
          settlingFrames++
        } else {
          settlingFrames = 0
        }
        if (settlingFrames >= SETTLING_THRESHOLD) {
          finishRoll()
        }
      }
    } catch {
      stopped = true
      return
    }
    animId = requestAnimationFrame(animate)
  }
  animId = requestAnimationFrame(animate)

  const finishRoll = () => {
    if (!pendingRoll) return
    const { isPreset, targetValues, resolve } = pendingRoll
    pendingRoll = null
    settlingFrames = 0

    const actualValues = meshes.map((mesh) => getUpFace(mesh.quaternion, params.sides))

    if (isPreset && targetValues) {
      const needsCorrection = targetValues.some((tv, i) => tv !== actualValues[i])
      if (needsCorrection) {
        let correctionsRemaining = 0
        for (let i = 0; i < meshes.length; i++) {
          if (targetValues[i] !== actualValues[i]) {
            correctionsRemaining++
            const targetQ = getTargetQuaternion(params.sides, targetValues[i])
            correctDiceOrientation(meshes[i], targetQ, 300, () => {
              correctionsRemaining--
              if (correctionsRemaining === 0) {
                resolve(targetValues)
              }
            })
          }
        }
      } else {
        resolve(targetValues)
      }
    } else {
      resolve(actualValues)
    }
  }

  const clearDice = () => {
    for (const mesh of meshes) {
      scene.remove(mesh)
      mesh.geometry.dispose()
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => (m as THREE.Material).dispose())
      } else {
        ;(mesh.material as THREE.Material).dispose()
      }
    }
    for (const collider of colliders) world.removeCollider(collider, true)
    for (const body of bodies) world.removeRigidBody(body)
    meshes.length = 0
    bodies.length = 0
    colliders.length = 0
  }

  const roll = async (presetValues?: number[]): Promise<number[]> => {
    clearDice()

    const isPreset = !!presetValues
    const targetValues = isPreset ? presetValues!.slice() : null

    const spacing = Math.min(2, 8 / Math.max(params.count, 1))
    const startX = -(params.count - 1) * spacing / 2

    for (let i = 0; i < params.count; i++) {
      const geo = createDiceGeometry(params.sides, 0.6)
      const faceDefs = DICE_FACE_DEFS[params.sides]
      const materials = applyFaceTextures(geo, params.sides, textures, faceDefs)
      const mesh = new THREE.Mesh(geo, materials)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.position.set(startX + i * spacing, physics.dropHeight, (Math.random() - 0.5) * 2)
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
        .setCcdEnabled(true)
      const body = world.createRigidBody(bodyDesc)

      const positions = geo.attributes.position.array as Float32Array
      const colliderDesc = RAPIER.ColliderDesc.convexHull(positions)
      if (!colliderDesc) {
        clearDice()
        stopped = true
        throw new Error(`无法为 d${params.sides} 构造凸包碰撞体`)
      }
      colliderDesc.setRestitution(physics.restitution)
      colliderDesc.setFriction(physics.friction)
      const collider = world.createCollider(colliderDesc, body)
      colliders.push(collider)

      const throwF = physics.throwForce
      const spinF = physics.spinForce
      body.applyImpulse(
        { x: (Math.random() - 0.5) * throwF * 0.3, y: 0, z: (Math.random() - 0.5) * throwF * 0.3 },
        true,
      )
      body.applyTorqueImpulse(
        { x: (Math.random() - 0.5) * spinF, y: (Math.random() - 0.5) * spinF, z: (Math.random() - 0.5) * spinF },
        true,
      )
      bodies.push(body)
    }

    return new Promise<number[]>((resolve) => {
      pendingRoll = { isPreset, targetValues, resolve }
      settlingFrames = 0
    })
  }

  const stop = () => {
    stopped = true
    cancelAnimationFrame(animId)
    pendingRoll = null
    for (const mesh of meshes) {
      mesh.geometry.dispose()
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => (m as THREE.Material).dispose())
      } else {
        ;(mesh.material as THREE.Material).dispose()
      }
    }
    for (const collider of colliders) world.removeCollider(collider, true)
    for (const body of bodies) world.removeRigidBody(body)
    try { world.free() } catch { /* WASM 堆损坏忽略 */ }
    renderer.dispose()
    controls.dispose()
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement)
    }
    container.innerHTML = ''
  }

  return { stop, roll }
}
