import { useEffect, useRef, useState, useCallback } from 'react'
import { Button, Select, Slider, Space } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import Phaser from 'phaser'
import CharacterDemo from './CharacterDemo'
import DiceSpriteScene from './DiceSpriteScene'
import DiceMatterScene from './DiceMatterScene'
import Dice2DPanel from './Dice2DPanel'
import type { DiceSideValue } from '../../game/dice'

type DemoType = 'rigid' | 'character' | 'dice-sprite' | 'dice-matter'

const REPEL_MAX_HOLD = 1500
const REPEL_MIN_R = 60
const REPEL_MAX_R = 360
const REPEL_BONUS_MAX = 3.0
const REPEL_FORCE_SCALE = 0.01

class PhysicsScene extends Phaser.Scene {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private M: any = (Phaser.Physics.Matter as any).Matter
  private dragConstraint: MatterJS.ConstraintType | null = null
  private charging = false
  private chargeStart = 0
  private chargeX = 0
  private chargeY = 0
  private chargeGfx!: Phaser.GameObjects.Graphics

  constructor() {
    super({ key: 'PhysicsScene' })
  }

  create() {
    const { width, height } = this.scale
    this.cameras.main.setBackgroundColor('#1a1a2e')

    const colors = [0xe94560, 0x533483, 0x4ac0c0, 0xf5a623, 0x7bed9f, 0xff6b81, 0x70a1ff]

    this.matter.add.rectangle(width / 2, height - 20, width - 40, 20, {
      isStatic: true,
      friction: 0.8,
      restitution: 0.3,
    })

    const lh = height - 40
    this.matter.add.rectangle(20, height / 2, 20, lh, { isStatic: true, restitution: 0.5 })
    this.matter.add.rectangle(width - 20, height / 2, 20, lh, { isStatic: true, restitution: 0.5 })

    const spawnBlock = () => {
      const size = 24 + Math.random() * 32
      const x = 80 + Math.random() * (width - 160)
      const color = colors[Math.floor(Math.random() * colors.length)]

      const rect = this.add.rectangle(x, -size, size, size, color)

      this.matter.add.gameObject(rect, {
        restitution: 0.4,
        friction: 0.6,
        density: 0.005,
        chamfer: { radius: size * 0.08 },
      })

      const body = rect.body as MatterJS.BodyType
      body.torque = (Math.random() - 0.5) * 0.05
      body.velocity.x = (Math.random() - 0.5) * 3
      body.velocity.y = Math.random() * 2 + 1
    }

    for (let i = 0; i < 10; i++) spawnBlock()

    this.time.addEvent({
      delay: 500,
      callback: spawnBlock,
      loop: true,
    })

    this.chargeGfx = this.add.graphics()
    this.input.mouse?.disableContextMenu()
    this.setupInteractions()
  }

  private setupInteractions() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.leftButtonDown()) {
        const dynamicBodies = this.matter.world.getAllBodies().filter((b) => !b.isStatic)
        const hit = this.M.Query.point(dynamicBodies, { x: p.worldX, y: p.worldY })[0]
        if (hit) {
          const constraint = this.M.Constraint.create({
            pointA: { x: p.worldX, y: p.worldY },
            bodyB: hit,
            stiffness: 0.1,
            damping: 0.1,
            length: 0,
          })
          this.dragConstraint = constraint
          this.matter.world.add(constraint)
        }
      } else if (p.rightButtonDown()) {
        this.charging = true
        this.chargeStart = this.time.now
        this.chargeX = p.worldX
        this.chargeY = p.worldY
      }
    })

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragConstraint) {
        this.dragConstraint.pointA = { x: p.worldX, y: p.worldY }
      }
    })

    this.input.on('pointerup', () => {
      if (this.dragConstraint) {
        this.matter.world.remove(this.dragConstraint)
        this.dragConstraint = null
      }
      if (this.charging) {
        this.releaseRepulsion()
        this.charging = false
        this.chargeGfx.clear()
      }
    })
  }

  private releaseRepulsion() {
    const holdMs = Math.min(this.time.now - this.chargeStart, REPEL_MAX_HOLD)
    const t = holdMs / REPEL_MAX_HOLD
    const radius = REPEL_MIN_R + t * (REPEL_MAX_R - REPEL_MIN_R)
    const base = (this.registry.get('baseStrength') as number) ?? 1.5
    const strength = base + t * REPEL_BONUS_MAX

    for (const body of this.matter.world.getAllBodies()) {
      if (body.isStatic) continue
      const dx = body.position.x - this.chargeX
      const dy = body.position.y - this.chargeY
      const d = Math.hypot(dx, dy)
      if (d >= radius || d < 0.01) continue
      const falloff = 1 - d / radius
      const mag = strength * falloff * body.mass * REPEL_FORCE_SCALE
      this.M.Body.applyForce(body, body.position, { x: (dx / d) * mag, y: (dy / d) * mag })
    }

    const shock = this.add.graphics({ x: this.chargeX, y: this.chargeY })
    shock.lineStyle(3, 0xff6b81, 1)
    shock.strokeCircle(0, 0, radius)
    this.tweens.add({
      targets: shock,
      alpha: 0,
      scale: 1.4,
      duration: 300,
      onComplete: () => shock.destroy(),
    })
  }

  update() {
    if (this.charging) {
      const t = Math.min((this.time.now - this.chargeStart) / REPEL_MAX_HOLD, 1)
      const radius = REPEL_MIN_R + t * (REPEL_MAX_R - REPEL_MIN_R)
      this.chargeGfx.clear()
      this.chargeGfx.fillStyle(0xff6b81, 0.15)
      this.chargeGfx.fillCircle(this.chargeX, this.chargeY, radius)
      this.chargeGfx.lineStyle(2, 0xff6b81, 0.9)
      this.chargeGfx.strokeCircle(this.chargeX, this.chargeY, radius)
    }

    const bodies = this.matter.world.getAllBodies()
    const h = this.scale.height
    for (const body of bodies) {
      if (!body.isStatic && body.position.y > h + 200) {
        this.matter.world.remove(body)
      }
    }
  }
}

export default function Demo2DPage() {
  const gameRef = useRef<Phaser.Game | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const phaserDivRef = useRef<HTMLDivElement | null>(null)
  const [demoType, setDemoType] = useState<DemoType>('rigid')
  const [baseStrength, setBaseStrength] = useState(1.5)
  const baseStrengthRef = useRef(1.5)
  const [diceResult, setDiceResult] = useState<{ values: number[]; total: number } | null>(null)
  const [diceRolling, setDiceRolling] = useState(false)
  const [diceCount, setDiceCount] = useState(2)
  const [diceSides, setDiceSides] = useState<DiceSideValue>(6)

  const createGame = (parent: HTMLElement) => {
    const width = parent.clientWidth
    const height = parent.clientHeight
    if (width < 10 || height < 10) return null

    const phaserDiv = document.createElement('div')
    phaserDiv.style.width = '100%'
    phaserDiv.style.height = '100%'
    parent.appendChild(phaserDiv)
    phaserDivRef.current = phaserDiv

    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      width,
      height,
      parent: phaserDiv,
      backgroundColor: '#1a1a2e',
      physics: {
        default: 'matter',
        matter: {
          gravity: { x: 0, y: 1.5 },
          debug: false,
        },
      },
      scene: PhysicsScene,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      input: {
        keyboard: true,
        mouse: true,
        touch: true,
      },
    })
    game.registry.set('baseStrength', baseStrengthRef.current)
    return game
  }

  const destroyGame = () => {
    if (gameRef.current) {
      gameRef.current.destroy(true)
      gameRef.current = null
    }
    if (phaserDivRef.current && phaserDivRef.current.parentNode) {
      phaserDivRef.current.parentNode.removeChild(phaserDivRef.current)
      phaserDivRef.current = null
    }
  }

  const createDiceGame = (parent: HTMLElement, mode: 'dice-sprite' | 'dice-matter') => {
    const width = parent.clientWidth
    const height = parent.clientHeight
    if (width < 10 || height < 10) return null

    const phaserDiv = document.createElement('div')
    phaserDiv.style.width = '100%'
    phaserDiv.style.height = '100%'
    parent.appendChild(phaserDiv)
    phaserDivRef.current = phaserDiv

    const scene = mode === 'dice-sprite' ? DiceSpriteScene : DiceMatterScene

    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      width,
      height,
      parent: phaserDiv,
      backgroundColor: '#1a1a2e',
      physics:
        mode === 'dice-matter'
          ? { default: 'matter', matter: { gravity: { x: 0, y: 1.5 }, debug: false } }
          : undefined,
      scene,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      input: {
        keyboard: true,
        mouse: true,
        touch: true,
      },
    })

    game.registry.set('diceCount', diceCount)
    game.registry.set('diceSides', diceSides)

    const onComplete = (result: { values: number[]; total: number }) => {
      setDiceResult(result)
      setDiceRolling(false)
    }
    game.events.on('dice-roll-complete', onComplete)

    return game
  }

  useEffect(() => {
    if (demoType !== 'rigid' && demoType !== 'dice-sprite' && demoType !== 'dice-matter') {
      destroyGame()
      return
    }
    const timer = requestAnimationFrame(() => {
      const wrapper = wrapperRef.current
      if (!wrapper) return
      if (demoType === 'rigid') {
        const game = createGame(wrapper)
        if (game) gameRef.current = game
      } else {
        const game = createDiceGame(wrapper, demoType as 'dice-sprite' | 'dice-matter')
        if (game) gameRef.current = game
      }
    })

    return () => {
      cancelAnimationFrame(timer)
      destroyGame()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoType])

  const onStrengthChange = (v: number) => {
    setBaseStrength(v)
    baseStrengthRef.current = v
    gameRef.current?.registry.set('baseStrength', v)
  }

  const handleReset = () => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    destroyGame()
    if (demoType === 'rigid') {
      const game = createGame(wrapper)
      if (game) gameRef.current = game
    } else if (demoType === 'dice-sprite' || demoType === 'dice-matter') {
      const game = createDiceGame(wrapper, demoType)
      if (game) gameRef.current = game
    }
  }

  const handleDiceRoll = useCallback((presetValues?: number[]) => {
    setDiceRolling(true)
    setDiceResult(null)
    gameRef.current?.events.emit('dice-roll', presetValues)
  }, [])

  const isDice = demoType === 'dice-sprite' || demoType === 'dice-matter'

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div
        ref={wrapperRef}
        style={{ width: '100%', height: '100%', background: '#1a1a2e', position: 'relative' }}
      />
      {demoType === 'character' && <CharacterDemo />}
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
          <Button
            icon={<ReloadOutlined />}
            onClick={handleReset}
            disabled={demoType === 'character'}
            style={{ width: 140 }}
          >
            复位
          </Button>
          <Select
            value={demoType}
            onChange={(v) => setDemoType(v as DemoType)}
            style={{ width: 140 }}
            options={[
              { value: 'rigid', label: '刚体碰撞演示' },
              { value: 'character', label: '人物状态演示' },
              { value: 'dice-sprite', label: '骰子·帧动画' },
              { value: 'dice-matter', label: '骰子·物理刚体' },
            ]}
          />
          {demoType === 'rigid' && (
            <div style={{ width: 140 }}>
              <div style={{ fontSize: 12, color: '#333' }}>基础斥力 {baseStrength.toFixed(1)}</div>
              <Slider min={0} max={4} step={0.1} value={baseStrength} onChange={onStrengthChange} />
            </div>
          )}
          {isDice && (
            <Dice2DPanel
              mode={demoType === 'dice-sprite' ? 'sprite' : 'matter'}
              count={diceCount}
              sides={diceSides}
              onCountChange={(v) => {
                setDiceCount(v)
                gameRef.current?.registry.set('diceCount', v)
              }}
              onSidesChange={setDiceSides}
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
