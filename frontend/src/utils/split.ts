// 章节切分——M1 文档 §3.2 预设正则原样保留

export interface SplitPattern {
  key: string
  label: string
  regex: RegExp | null
}

export const PRESET_PATTERNS: SplitPattern[] = [
  { key: 'zhang', label: '第X章（中文/阿拉伯数字）', regex: /^(第[0-9零一二三四五六七八九十百千万]+章.*)/ },
  { key: 'hui', label: '第X回', regex: /^(第[0-9零一二三四五六七八九十百千万]+回.*)/ },
  { key: 'juan', label: '第X卷', regex: /^(第[0-9零一二三四五六七八九十百千万]+卷.*)/ },
  { key: 'digit', label: '数字章节（001章、01 章）', regex: /^(\d{1,4}\s*章.*)/ },
  { key: 'custom', label: '自定义正则', regex: null },
]

export interface SplitResult {
  title: string
  content: string
}

const TITLE_MAX = 50

/**
 * 按行扫描切分。匹配行视为新章标题；标题之前的内容按 keepPrologue 决定
 * 归入"序章"或并入第一章。无任何匹配时全文作为单章。
 */
export function splitChapters(
  text: string,
  regex: RegExp,
  keepPrologue: boolean,
): SplitResult[] {
  const lines = text.split(/\r?\n/)
  const chapters: SplitResult[] = []
  let curTitle: string | null = null
  let buf: string[] = []

  const flush = () => {
    const content = buf.join('\n').trim()
    if (curTitle !== null) {
      chapters.push({ title: curTitle.slice(0, TITLE_MAX), content })
    } else if (content) {
      if (keepPrologue) chapters.push({ title: '序章', content })
      else buf = content.split('\n') // 暂存，并入第一章
    }
  }

  for (const line of lines) {
    const m = line.trim().match(regex)
    if (m) {
      const pending = curTitle === null && !keepPrologue && buf.join('\n').trim() ? buf.join('\n').trim() : null
      flush()
      curTitle = m[1].trim()
      buf = pending ? [pending] : []
    } else {
      buf.push(line)
    }
  }
  flush()

  if (chapters.length === 0) {
    return [{ title: '全文（未匹配到章节标题）', content: text.trim() }]
  }
  return chapters
}

/** 字符保留率：清理前后去空白字符数对比（M1 §3.8 护栏） */
export function retentionRate(before: string, after: string): number {
  const a = before.replace(/\s/g, '').length
  const b = after.replace(/\s/g, '').length
  if (a === 0) return 1
  return b / a
}
