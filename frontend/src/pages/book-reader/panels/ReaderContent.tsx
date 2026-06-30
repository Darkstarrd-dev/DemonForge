// 沉浸式阅读器 · 正文内容面板。
// 受控组件：currentChapter + fontSize + findOpen + findRegex + contentRef
// 注：findOpen 模式下对每段做高亮；否则直接渲染原文。
import { forwardRef } from 'react'
import type { Chapter } from '../../../services/types'

export interface ReaderContentProps {
  current: Chapter | null
  fontSize: number
  findOpen: boolean
  findRegex: RegExp | null
}

function highlightParts(text: string, regex: RegExp | null): { text: string; hl: boolean }[] {
  if (!regex) return [{ text, hl: false }]
  const parts: { text: string; hl: boolean }[] = []
  const re = new RegExp(regex.source, regex.flags)
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), hl: false })
    parts.push({ text: m[0], hl: true })
    last = m.index + m[0].length
    if (m[0].length === 0) re.lastIndex++
  }
  if (last < text.length) parts.push({ text: text.slice(last), hl: false })
  return parts.length > 0 ? parts : [{ text, hl: false }]
}

const ReaderContent = forwardRef<HTMLDivElement, ReaderContentProps>(function ReaderContent(
  { current, fontSize, findOpen, findRegex },
  contentRef,
) {
  if (!current) return <div ref={contentRef} className="immersive-content" />
  const textBody = findOpen && findRegex ? (
    <div className="immersive-text-para">
      {current.content.split('\n').map((p, i) => {
        const parts = highlightParts(p, findRegex)
        return (
          <p key={i} data-para-idx={i}>
            {parts.map((pt, j) =>
              pt.hl ? (
                <mark key={j} className="imm-find-hl">
                  {pt.text}
                </mark>
              ) : (
                pt.text
              ),
            )}
          </p>
        )
      })}
    </div>
  ) : (
    <div className="immersive-text">{current.content}</div>
  )
  return (
    <div ref={contentRef} className="immersive-content">
      <div className="immersive-content-inner" style={{ fontSize, lineHeight: 1.85 }}>
        <h1 className="immersive-title">{current.title}</h1>
        {textBody}
      </div>
    </div>
  )
})

export default ReaderContent
