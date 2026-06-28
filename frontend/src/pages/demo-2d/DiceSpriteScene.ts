import Phaser from 'phaser'
import { DiceRoller } from '../../game/dice'

const FRAME_PREFIX = 'dieWhite'
const FRAME_COUNT = 6
const ANIM_DURATION = 800 // ms

export default class DiceSpriteScene extends Phaser.Scene {
  private sprites: Phaser.GameObjects.Sprite[] = []
  private roller = new DiceRoller()
  private rolling = false

  constructor() {
    super({ key: 'DiceSpriteScene' })
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

    this.game.events.on('dice-roll', (presetValues?: number[]) => {
      this.rollDice(presetValues)
    })
  }

  private rollDice(presetValues?: number[]) {
    if (this.rolling) return
    this.rolling = true

    const count = (this.registry.get('diceCount') as number) ?? 2
    const result = this.roller.roll({ count, sides: 6, presetValues })

    this.sprites.forEach((s) => s.destroy())
    this.sprites = []

    const { width, height } = this.scale
    const spacing = Math.min(100, (width - 100) / Math.max(count, 1))
    const startX = (width - (count - 1) * spacing) / 2

    for (let i = 0; i < count; i++) {
      const sprite = this.add.sprite(startX + i * spacing, height / 2, 'dice-yahtzee', `${FRAME_PREFIX}1`)
      sprite.setScale(2)
      this.sprites.push(sprite)
    }

    const frameDuration = 60
    const totalFrames = Math.floor(ANIM_DURATION / frameDuration)

    this.time.addEvent({
      delay: frameDuration,
      repeat: totalFrames - 1,
      callback: () => {
        this.sprites.forEach((s) => {
          const rnd = Math.floor(Math.random() * FRAME_COUNT) + 1
          s.setFrame(`${FRAME_PREFIX}${rnd}`)
        })
      },
    })

    this.time.delayedCall(ANIM_DURATION + 100, () => {
      this.sprites.forEach((s, i) => {
        s.setFrame(`${FRAME_PREFIX}${result.values[i]}`)
      })
      this.rolling = false
      this.game.events.emit('dice-roll-complete', result)
    })
  }
}