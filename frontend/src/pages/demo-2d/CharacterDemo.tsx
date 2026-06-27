import { useState } from 'react'

// 占位色：切换时换色 + 换编号，直观体现「切换生效」（后续接真实图片时替换为 URL）
const AVATAR_COLORS = ['#e94560', '#533483', '#4ac0c0', '#f5a623']
const BODY_COLORS = ['#7bed9f', '#ff6b81', '#70a1ff', '#e94560']

// 占位人物设定文本
const PROFILE_TEXT = [
  '姓名：占位姓名',
  '身份：占位身份 / 占位阵营',
  '性格：占位 · 占位 · 占位',
  '简介：这里是人物设定的占位文本，',
  '　　　用于演示文本框的排版与换行……',
]

const LINE = '1px solid rgba(255,255,255,0.45)'

// 图片占位容器：占位色块 + 居中编号 + 左右半区点击切换
function SwitchBox(props: {
  width: number
  height?: number
  aspectRatio?: string
  color: string
  label: string
  onPrev: () => void
  onNext: () => void
}) {
  const { width, height, aspectRatio, color, label, onPrev, onNext } = props
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        aspectRatio,
        border: LINE,
        boxSizing: 'border-box',
        background: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
      }}
    >
      <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, pointerEvents: 'none' }}>
        {label}
      </span>
      <ClickHalf side="left" onClick={onPrev} />
      <ClickHalf side="right" onClick={onNext} />
    </div>
  )
}

// 半幅透明点击区：hover 时显示方向箭头
function ClickHalf({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: side === 'left' ? 0 : undefined,
        right: side === 'right' ? 0 : undefined,
        width: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        background: hover ? 'rgba(0,0,0,0.18)' : 'transparent',
        color: 'rgba(255,255,255,0.9)',
        fontSize: 24,
      }}
    >
      {hover ? (side === 'left' ? '◀' : '▶') : ''}
    </div>
  )
}

export default function CharacterDemo() {
  const [avatarIndex, setAvatarIndex] = useState(0)
  const [bodyIndex, setBodyIndex] = useState(0)
  const avatarN = AVATAR_COLORS.length
  const bodyN = BODY_COLORS.length

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: '#16213e',
        border: '1px dashed rgba(255,255,255,0.35)',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* 全屏背景占位标注 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.18)',
          fontSize: 28,
          letterSpacing: 6,
          pointerEvents: 'none',
        }}
      >
        背景图片
      </div>

      {/* 前景：左列(头像 + 文本框) | 右列(全身图)，垂直居中、左右对称留白 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 5%',
          boxSizing: 'border-box',
        }}
      >
        {/* 左列 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SwitchBox
            width={180}
            aspectRatio="1"
            color={AVATAR_COLORS[avatarIndex]}
            label={`头像 ${avatarIndex + 1}/${avatarN}`}
            onPrev={() => setAvatarIndex((i) => (i - 1 + avatarN) % avatarN)}
            onNext={() => setAvatarIndex((i) => (i + 1) % avatarN)}
          />
          <div
            style={{
              width: 220,
              minHeight: 120,
              border: LINE,
              boxSizing: 'border-box',
              padding: 12,
              color: 'rgba(255,255,255,0.75)',
              fontSize: 13,
              lineHeight: 1.8,
              background: 'rgba(0,0,0,0.25)',
            }}
          >
            {PROFILE_TEXT.map((t, i) => (
              <div key={i}>{t}</div>
            ))}
          </div>
        </div>

        {/* 右列：全身图 */}
        <SwitchBox
          width={200}
          height={420}
          color={BODY_COLORS[bodyIndex]}
          label={`全身图 ${bodyIndex + 1}/${bodyN}`}
          onPrev={() => setBodyIndex((i) => (i - 1 + bodyN) % bodyN)}
          onNext={() => setBodyIndex((i) => (i + 1) % bodyN)}
        />
      </div>
    </div>
  )
}
