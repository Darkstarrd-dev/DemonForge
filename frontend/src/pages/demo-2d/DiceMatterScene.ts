import Phaser from 'phaser'
import { DiceRoller } from '../../game/dice'
import type { DiceSideValue } from '../../game/dice'

const FRAME_PREFIX = 'dieWhite'
const FRAME_COUNT = 6
const DICE_SCALE = 1.5
const DICE_SIZE = 64
const DICE_DISPLAY_SIZE = DICE_SIZE * DICE_SCALE

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Matter = (Phaser.Physics.Matter as any).Matter

export default class DiceMatterScene extends Phaser.Scene {
  private diceBodies: MatterJS.BodyType[] = []
  private diceSprites: Phaser.GameObjects.Sprite[] = []
  private roller = new DiceRoller()
  private rolling = false
  private rollResult: { values: number[]; total: number } | null = null
  private rollHandler?: (presetValues?: number[]) => void
  private configHandler?: () => void
  private rollTimer?: Phaser.Time.TimerEvent
  private throwStrength = 5
  private spinStrength = 5

  constructor() {
    super({ key: 'DiceMatterScene' })
  }

  preload() {
    this.load.atlas(
      'dice-yahtzee',
      '/dice-assets/yahtzee/dice.png',
      '/dice-assets/yahtzee/dice.json',
    )
  }

  create() {
    this.cameras.main.setBackgroundColor('#1a1a2e')
    const { width, height } = this.scale

    this.matter.add.rectangle(width / 2, height - 20, width - 40, 20, {
      isStatic: true,
      friction: 0.8,
      restitution: 0.3,
    })

    this.matter.add.rectangle(20, height / 2, 20, height - 40, { isStatic: true, restitution: 0.5 })
    this.matter.add.rectangle(width - 20, height / 2, 20, height - 40, { isStatic: true, restitution: 0.5 })

    this.rollHandler = (presetValues?: number[]) => {
      this.rollDice(presetValues)
    }
    this.game.events.on('dice-roll', this.rollHandler)

    this.configHandler = () => this.onConfigUpdate()
    this.game.events.on('dice-config-update', this.configHandler)

    const simSpeed = (this.registry.get('diceSimSpeed') as number) ?? 1.0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(this.matter.world as any).engine.timing.timeScale = simSpeed

    this.spawnDice()
  }

  shutdown() {
    if (this.rollHandler) {
      this.game.events.off('dice-roll', this.rollHandler)
      this.rollHandler = undefined
    }
    if (this.configHandler) {
      this.game.events.off('dice-config-update', this.configHandler)
      this.configHandler = undefined
    }
  }

  private onConfigUpdate() {
    this.throwStrength = (this.registry.get('diceThrowStrength') as number) ?? 5
    this.spinStrength = (this.registry.get('diceSpinStrength') as number) ?? 5
    const simSpeed = (this.registry.get('diceSimSpeed') as number) ?? 1.0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(this.matter.world as any).engine.timing.timeScale = simSpeed
    const newCount = (this.registry.get('diceCount') as number) ?? 2
    if (newCount !== this.diceSprites.length) {
      this.spawnDice()
    }
  }

  private spawnDice() {
    if (this.rollTimer) { this.time.removeEvent(this.rollTimer); this.rollTimer = undefined }
    this.rollResult = null
    this.rolling = false

    this.diceBodies.forEach((b) => this.matter.world.remove(b))
    this.diceSprites.forEach((s) => s.destroy())
    this.diceBodies = []
    this.diceSprites = []

    const count = (this.registry.get('diceCount') as number) ?? 2
    const { width, height } = this.scale
    if (count === 0) return

    const positions = this.computeScatterPositions(count, width, height)
    for (let i = 0; i < count; i++) {
      const { x, y, rotation } = positions[i]
      const sprite = this.createDiceSprite(x, y, rotation, true)
      this.diceBodies.push(sprite.body as MatterJS.BodyType)
      this.diceSprites.push(sprite)
    }
  }

  private computeScatterPositions(
    count: number, width: number, height: number,
  ): { x: number; y: number; rotation: number }[] {
    const centerX = width / 2
    const centerY = height / 2
    const range = Math.min(width, height) * 0.25
    const minDist = 110
    const positions: { x: number; y: number; rotation: number }[] = []

    for (let i = 0; i < count; i++) {
      let placed = false
      for (let attempt = 0; attempt < 50; attempt++) {
        const x = centerX + (Math.random() - 0.5) * range * 2
        const y = centerY + (Math.random() - 0.5) * range * 2
        let ok = true
        for (const p of positions) {
          if (Math.hypot(p.x - x, p.y - y) < minDist) { ok = false; break }
        }
        if (ok) {
          positions.push({ x, y, rotation: Math.random() * Math.PI * 2 })
          placed = true
          break
        }
      }
      if (!placed) {
        positions.push({
          x: centerX + (i - count / 2) * minDist,
          y: centerY,
          rotation: Math.random() * Math.PI * 2,
        })
      }
    }
    return positions
  }

  private createDiceSprite(x: number, y: number, rotation: number, isStatic: boolean): Phaser.GameObjects.Sprite {
    const frame = `${FRAME_PREFIX}${Math.floor(Math.random() * FRAME_COUNT) + 1}`
    const sprite = this.add.sprite(x, y, 'dice-yahtzee', frame)
    sprite.setScale(DICE_SCALE)

    const body = Matter.Bodies.rectangle(x, y, DICE_DISPLAY_SIZE, DICE_DISPLAY_SIZE, {
      isStatic,
      restitution: 0.5,
      friction: 0.6,
      density: 0.002,
      chamfer: { radius: 4 },
    })
    Matter.Body.setAngle(body, rotation)

    this.matter.add.gameObject(sprite, body)
    return sprite
  }

  private rollDice(presetValues?: number[]) {
    if (this.rolling) return
    this.rolling = true
    this.rollResult = null

    if (this.rollTimer) { this.time.removeEvent(this.rollTimer); this.rollTimer = undefined }

    this.diceBodies.forEach((b) => this.matter.world.remove(b))
    this.diceSprites.forEach((s) => s.destroy())
    this.diceBodies = []
    this.diceSprites = []

    const count = (this.registry.get('diceCount') as number) ?? 2
    const sides = (this.registry.get('diceSides') as DiceSideValue) ?? 6
    const { width, height } = this.scale
    const result = this.roller.roll({ count, sides, presetValues })

    const positions = this.computeScatterPositions(count, width, height)
    for (let i = 0; i < count; i++) {
      const { x, y, rotation } = positions[i]
      const sprite = this.createDiceSprite(x, y, rotation, false)
      const body = sprite.body as MatterJS.BodyType

      const angle = -Math.random() * Math.PI
      const speed = this.throwStrength * 1.0 * (0.7 + Math.random() * 0.6)
      Matter.Body.setVelocity(body, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed })

      const spin = this.spinStrength * 0.02 * (0.7 + Math.random() * 0.6)
      Matter.Body.setAngularVelocity(body, Math.random() < 0.5 ? -spin : spin)

      this.diceBodies.push(body)
      this.diceSprites.push(sprite)
    }

    this.rollTimer = this.time.delayedCall(2000, () => {
      this.diceSprites.forEach((s, i) => {
        s.setFrame(`${FRAME_PREFIX}${result.values[i]}`)
      })
      this.rolling = false
      this.rollResult = result
      this.game.events.emit('dice-roll-complete', result)
    })
  }

  update() {
    if (this.rollResult) {
      this.diceSprites.forEach((s, i) => {
        s.setFrame(`${FRAME_PREFIX}${this.rollResult!.values[i]}`)
      })
    }
  }
}
