import Phaser from 'phaser'
import { DiceRoller } from '../../game/dice'
import type { Dice2DLayout, DiceSideValue } from '../../game/dice'

const FRAME_PREFIX = 'dieWhite'
const FRAME_COUNT = 6
const ANIM_DURATION = 800

export default class DiceSpriteScene extends Phaser.Scene {
  private sprites: Phaser.GameObjects.Sprite[] = []
  private roller = new DiceRoller()
  private rolling = false
  private rollHandler?: (presetValues?: number[]) => void
  private configHandler?: () => void
  private size = 2
  private spacing = 100
  private layout: Dice2DLayout = 'horizontal'
  private scatterPositions: { x: number; y: number; rotation: number }[] | null = null
  private lastLayout: Dice2DLayout | null = null

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

    this.rollHandler = (presetValues?: number[]) => {
      this.rollDice(presetValues)
    }
    this.game.events.on('dice-roll', this.rollHandler)

    this.configHandler = () => this.onConfigUpdate()
    this.game.events.on('dice-config-update', this.configHandler)

    this.scale.on('resize', () => this.layoutSprites())

    this.spawnSprites()
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
    this.scale.off('resize')
  }

  private onConfigUpdate() {
    const newSize = (this.registry.get('diceSize') as number) ?? 2
    const newSpacing = (this.registry.get('diceSpacing') as number) ?? 100
    const newLayout = (this.registry.get('diceLayout') as Dice2DLayout) ?? 'horizontal'
    const newCount = (this.registry.get('diceCount') as number) ?? 2

    const spacingChanged = newSpacing !== this.spacing
    const layoutChanged = newLayout !== this.layout

    this.size = newSize
    this.spacing = newSpacing
    this.layout = newLayout

    if (newCount !== this.sprites.length) {
      this.spawnSprites()
    } else {
      if (this.layout === 'scatter' && (spacingChanged || layoutChanged)) {
        this.scatterPositions = null
        this.lastLayout = null
      }
      this.layoutSprites()
    }
  }

  private spawnSprites() {
    const count = (this.registry.get('diceCount') as number) ?? 2
    while (this.sprites.length < count) {
      const s = this.add.sprite(0, 0, 'dice-yahtzee', `${FRAME_PREFIX}1`)
      s.setScale(this.size)
      this.sprites.push(s)
    }
    while (this.sprites.length > count) {
      const s = this.sprites.pop()!
      s.destroy()
    }
    this.scatterPositions = null
    this.lastLayout = null
    this.layoutSprites()
  }

  private layoutSprites() {
    const { width, height } = this.scale
    const count = this.sprites.length
    if (count === 0 || width < 10 || height < 10) return

    let positions: { x: number; y: number; rotation: number }[]
    if (this.layout === 'scatter') {
      if (this.lastLayout !== 'scatter' || !this.scatterPositions || this.scatterPositions.length !== count) {
        this.scatterPositions = this.computeScatterPositions(count, width, height)
      }
      positions = this.scatterPositions
    } else {
      positions = this.computeLayout(count, width, height)
      this.scatterPositions = null
    }
    this.lastLayout = this.layout

    for (let i = 0; i < count; i++) {
      this.sprites[i].setPosition(positions[i].x, positions[i].y)
      this.sprites[i].setScale(this.size)
      this.sprites[i].setRotation(positions[i].rotation)
    }
  }

  private computeLayout(
    count: number, width: number, height: number,
  ): { x: number; y: number; rotation: number }[] {
    const positions: { x: number; y: number; rotation: number }[] = []
    if (this.layout === 'horizontal') {
      const spacing = this.spacing
      const totalWidth = (count - 1) * spacing
      const startX = (width - totalWidth) / 2
      for (let i = 0; i < count; i++) {
        positions.push({ x: startX + i * spacing, y: height / 2, rotation: 0 })
      }
    } else {
      const cols = Math.max(1, Math.ceil(Math.sqrt(count)))
      const rows = Math.max(1, Math.ceil(count / cols))
      const cellSize = this.spacing
      const totalW = (cols - 1) * cellSize
      const totalH = (rows - 1) * cellSize
      const startX = (width - totalW) / 2
      const startY = (height - totalH) / 2
      for (let i = 0; i < count; i++) {
        const col = i % cols
        const row = Math.floor(i / cols)
        positions.push({ x: startX + col * cellSize, y: startY + row * cellSize, rotation: 0 })
      }
    }
    return positions
  }

  private computeScatterPositions(
    count: number, width: number, height: number,
  ): { x: number; y: number; rotation: number }[] {
    const positions: { x: number; y: number; rotation: number }[] = []
    const spriteSize = 64 * this.size
    const minDist = spriteSize + 10
    const centerX = width / 2
    const centerY = height / 2
    const rangeX = Math.min(this.spacing * 4, width * 0.8)
    const rangeY = Math.min(this.spacing * 4, height * 0.8)
    for (let i = 0; i < count; i++) {
      let placed = false
      for (let attempt = 0; attempt < 50; attempt++) {
        const x = centerX + (Math.random() - 0.5) * rangeX
        const y = centerY + (Math.random() - 0.5) * rangeY
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
          x: width / 2 + (i - count / 2) * minDist,
          y: height / 2,
          rotation: Math.random() * Math.PI * 2,
        })
      }
    }
    return positions
  }

  private rollDice(presetValues?: number[]) {
    if (this.rolling) return
    this.rolling = true

    const count = (this.registry.get('diceCount') as number) ?? 2
    const sides = (this.registry.get('diceSides') as DiceSideValue) ?? 6
    const result = this.roller.roll({ count, sides, presetValues })

    if (this.sprites.length !== count) {
      this.spawnSprites()
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