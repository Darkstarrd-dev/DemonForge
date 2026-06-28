import Phaser from 'phaser'
import { DiceRoller } from '../../game/dice'
import type { DiceSideValue } from '../../game/dice'

const FRAME_PREFIX = 'dieWhite'
const FRAME_COUNT = 6

export default class DiceMatterScene extends Phaser.Scene {
  private diceBodies: MatterJS.BodyType[] = []
  private diceSprites: Phaser.GameObjects.Sprite[] = []
  private roller = new DiceRoller()
  private rolling = false
  private rollResult: { values: number[]; total: number } | null = null
  private rollHandler?: (presetValues?: number[]) => void

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
  }

  shutdown() {
    if (this.rollHandler) {
      this.game.events.off('dice-roll', this.rollHandler)
      this.rollHandler = undefined
    }
  }

  private rollDice(presetValues?: number[]) {
    if (this.rolling) return
    this.rolling = true
    this.rollResult = null

    const count = (this.registry.get('diceCount') as number) ?? 2
    const sides = (this.registry.get('diceSides') as DiceSideValue) ?? 6
    const result = this.roller.roll({ count, sides, presetValues })

    this.diceBodies.forEach((b) => this.matter.world.remove(b))
    this.diceSprites.forEach((s) => s.destroy())
    this.diceBodies = []
    this.diceSprites = []

    const { width } = this.scale
    const spacing = Math.min(100, (width - 100) / Math.max(count, 1))
    const startX = (width - (count - 1) * spacing) / 2

    for (let i = 0; i < count; i++) {
      const x = startX + i * spacing + (Math.random() - 0.5) * 20
      const y = 60 + Math.random() * 40
      const frame = `${FRAME_PREFIX}${Math.floor(Math.random() * FRAME_COUNT) + 1}`

      const sprite = this.add.sprite(x, y, 'dice-yahtzee', frame)
      sprite.setScale(1.5)

      this.matter.add.gameObject(sprite, {
        restitution: 0.5,
        friction: 0.6,
        density: 0.002,
        chamfer: { radius: 4 },
      })

      const body = sprite.body as MatterJS.BodyType
      body.force = { x: (Math.random() - 0.5) * 0.02, y: -0.02 }
      body.torque = (Math.random() - 0.5) * 0.03

      this.diceBodies.push(body)
      this.diceSprites.push(sprite)
    }

    this.time.delayedCall(2000, () => {
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
