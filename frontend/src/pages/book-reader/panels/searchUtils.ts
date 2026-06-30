// 沉浸式阅读器 · 查找替换工具函数。
// 与 SearchReplacePanel 拆分（react-refresh 规则：常量/函数应在独立文件）。
import type { Chapter } from '../../../services/types'

export interface FindResult {
  chapterId: string
  chapterTitle: string
  paraIdx: number
  paraText: string
}

/** 构建正则；空 pattern 或非法返回 null */
export function buildFindRegex(pattern: string, useRegex: boolean, caseSensitive: boolean): RegExp | null {
  try {
    const src = useRegex ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(src, caseSensitive ? 'g' : 'gi')
  } catch {
    return null
  }
}

/** 扫描所有章节段落，生成匹配结果列表 */
export function buildFindResults(chapters: Chapter[], regex: RegExp): FindResult[] {
  const out: FindResult[] = []
  for (const ch of chapters) {
    const paras = ch.content.split('\n')
    for (let i = 0; i < paras.length; i++) {
      const clone = new RegExp(regex.source, regex.flags)
      if (clone.test(paras[i])) out.push({ chapterId: ch.id, chapterTitle: ch.title, paraIdx: i, paraText: paras[i] })
    }
  }
  return out
}

/** 文本按正则切片（用于搜索结果列表的高亮） */
export function highlightParts(text: string, regex: RegExp | null): { text: string; hl: boolean }[] {
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
