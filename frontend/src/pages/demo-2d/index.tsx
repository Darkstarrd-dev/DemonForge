import { useEffect, useRef } from 'react'
import { Button, Space, Card, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import Phaser from 'phaser'

class PhysicsScene extends Phaser.Scene {
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
  }

  update() {
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

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const timer = requestAnimationFrame(() => {
      if (!wrapper) return
      const game = createGame(wrapper)
      if (game) gameRef.current = game
    })

    return () => {
      cancelAnimationFrame(timer)
      destroyGame()
    }
  }, [])

  const handleReset = () => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    destroyGame()
    const game = createGame(wrapper)
    if (game) gameRef.current = game
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <Card size="small">
        <Space>
          <Typography.Text strong>2D 刚体演示</Typography.Text>
          <Typography.Text type="secondary">Phaser + Matter.js · 方块掉落碰撞</Typography.Text>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>复位</Button>
        </Space>
      </Card>
      <div
        ref={wrapperRef}
        style={{ flex: 1, minHeight: 400, borderRadius: 8, overflow: 'hidden', background: '#1a1a2e', position: 'relative' }}
      />
    </div>
  )
}
