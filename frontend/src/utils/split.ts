// 章节切分——M1 文档 §3.2 预设正则 + 自动检测 + 卷/前缀处理

import type { SplitPattern as StoredSplitPattern } from '../services/types'

/** 持久化形态（regex 为字符串，存 settings.json） */
export type { SplitPattern as StoredSplitPattern } from '../services/types'

/** 检测/切分时使用的运行时形态：regex 已编译为 RegExp（custom 为 null） */
export interface SplitPattern {
  key: string
  label: string
  regex: RegExp | null
  flags?: string
  builtin?: boolean
}

/** 内置默认模式池（用户可在设置页增删改；custom 永远保留在列表末尾） */
export const DEFAULT_SPLIT_PATTERNS: StoredSplitPattern[] = [
  { key: 'zhang',   label: '第X章（中文/阿拉伯数字）', regex: '^(第[0-9零一二三四五六七八九十百千万]+章.*)', builtin: true },
  { key: 'hui',     label: '第X回',   regex: '^(第[0-9零一二三四五六七八九十百千万]+回.*)', builtin: true },
  { key: 'juan',    label: '第X卷',   regex: '^(第[0-9零一二三四五六七八九十百千万]+卷.*)', builtin: true },
  { key: 'jie',     label: '第X节',   regex: '^(第[0-9零一二三四五六七八九十百千万]+节.*)', builtin: true },
  { key: 'x-zhang', label: 'X章（无「第」字）', regex: '^([0-9零一二三四五六七八九十百千万]+章.*)', builtin: true },
  { key: 'chapter', label: 'Chapter N（英文）', regex: '^(chapter\\s+[0-9ivxlc]+.*)', flags: 'i', builtin: true },
  { key: 'dunhao',  label: '数字+顿号（3、标题）', regex: '^(\\d{1,4}、.*)', builtin: true },
  { key: 'custom',  label: '自定义正则', regex: '', builtin: true },
]

/** 内置卷正则（旁路识别卷行，独立于用户当前选的模式） */
const VOLUME_REGEX = /^(第[0-9零一二三四五六七八九十百千万]+卷.*)/

/** 散落装饰符号（爱心/星号/方框/序号圈/书名号/括号等 + 空白） */
const DECOR_SYMBOLS = /^[☆★◆●○■□※▪♦♥♠♣①-⑳Ⅰ-Ⅻ【】[]「」『』《》（）()\s]+/

/**
 * 剥除标题行前的装饰前缀。支持两类：
 * ① 成对符号包裹的任意内容块（如 [爱心]、【公告】、（注）），内容可含中文；
 * ② 散落的单个装饰符号 + 空白。
 * 两类交替反复剥除，直到剩下章节正文。
 */
const DECOR_BLOCK = /^(\[[^\]]*\]|【[^】]*】|（[^）]*）|\([^)]*\)|「[^」]*」|『[^』]*』|《[^》]*》)/

function stripDecor(s: string): string {
  let out = s
  // 反复剥：每轮先剥一个成对包裹块，再剥散落符号；都不再变化时停止
  for (let i = 0; i < 10; i++) {
    const before = out
    out = out.replace(DECOR_BLOCK, '')
    out = out.replace(DECOR_SYMBOLS, '')
    if (out === before) break
  }
  return out
}

/**
 * 把存储形态（regex 字符串）编译为运行时形态（regex RegExp）。
 * custom 模式或编译失败 → regex 为 null。
 */
export function compilePatterns(stored: StoredSplitPattern[]): SplitPattern[] {
  return stored.map((p) => {
    if (p.key === 'custom' || !p.regex) return { ...p, regex: null }
    try {
      return { ...p, regex: new RegExp(p.regex, p.flags) }
    } catch {
      return { ...p, regex: null }
    }
  })
}

/** 兼容旧 import：从默认池编译出含 RegExp 的预设列表（custom 在末尾，regex 为 null） */
export const PRESET_PATTERNS: SplitPattern[] = compilePatterns(DEFAULT_SPLIT_PATTERNS)

export interface SplitResult {
  title: string
  content: string
  /** 卷标题行单独成章标记（Step3 跳过 LLM 清理） */
  isVolume?: boolean
}

const TITLE_MAX = 50

export interface DetectResult {
  /** 推荐模式 key（无命中时返回 'custom'） */
  patternKey: string
  /** 命中行数 */
  hitCount: number
  /** 0~1，命中数 / 次优命中数（无次优时为 1） */
  confidence: number
  /** 给 UI 的说明 */
  reason: string
  /** 抽样命中标题（前 5 个，已剥前缀） */
  sampledTitles: string[]
}

const MIN_HITS = 2

/**
 * 自动检测最匹配的章节模式。
 * 逐行扫描，每行先 trim、剥装饰前缀，再对每个非 custom 模式测试命中。
 * 取 hitCount >= MIN_HITS 的最大者；卷模式仅在无章类命中时作为兜底推荐。
 */
export function detectChapterPattern(text: string, stored: StoredSplitPattern[]): DetectResult {
  const patterns = compilePatterns(stored).filter((p) => p.key !== 'custom' && p.regex)
  const lines = text.split(/\r?\n/)

  const stats = patterns.map((p) => {
    let hit = 0
    const titles: string[] = []
    for (const raw of lines) {
      const stripped = stripDecor(raw.trim())
      const m = stripped.match(p.regex!)
      if (m) {
        hit++
        if (titles.length < 5) titles.push(m[1].trim().slice(0, TITLE_MAX))
      }
    }
    return { pattern: p, hit, titles }
  })

  const valid = stats.filter((s) => s.hit >= MIN_HITS)
  if (valid.length === 0) {
    return {
      patternKey: 'custom',
      hitCount: 0,
      confidence: 0,
      reason: '未检测到明显章节模式，可手动选择模式或输入自定义正则',
      sampledTitles: [],
    }
  }

  // 卷模式仅在无其他章类命中时作为兜底
  const nonVolume = valid.filter((s) => s.pattern.key !== 'juan')
  const pool = nonVolume.length > 0 ? nonVolume : valid

  pool.sort((a, b) => b.hit - a.hit)
  const best = pool[0]
  const second = pool[1]
  const confidence = second ? best.hit / (best.hit + second.hit) : 1

  const high = confidence >= 0.5
  const reason = high
    ? `检测到「${best.pattern.label}」模式，命中 ${best.hit} 处`
    : `多种模式部分匹配（${pool.map((s) => `${s.pattern.label}×${s.hit}`).join('、')}），建议核对预览`

  return {
    patternKey: best.pattern.key,
    hitCount: best.hit,
    confidence,
    reason,
    sampledTitles: best.titles,
  }
}

export interface SplitOptions {
  /** 剥除标题行前的装饰符号前缀，默认 true */
  stripDecorPrefix?: boolean
}

/**
 * 按行扫描切分。匹配行视为新章标题；标题之前的内容按 keepPrologue 决定
 * 归入"序章"或并入第一章。无任何匹配时全文作为单章。
 *
 * 卷结构：当用户选的模式非卷模式时，仍用内置 VOLUME_REGEX 旁路识别卷行，
 * 卷行单独成一章（isVolume=true），其内容为卷行之后到下一个卷/章行之前的文本。
 * 标题前的装饰符号会被剥除（由 stripDecorPrefix 控制）。
 */
export function splitChapters(
  text: string,
  regex: RegExp,
  keepPrologue: boolean,
  options: SplitOptions = {},
): SplitResult[] {
  const stripDecorEnabled = options.stripDecorPrefix !== false
  // 注：装饰前缀剥除是核心行为，stripDecorEnabled 当前保留以兼容签名；如需关闭可在此分支处理。
  void stripDecorEnabled
  const lines = text.split(/\r?\n/)
  const chapters: SplitResult[] = []
  let curTitle: string | null = null
  let curIsVolume = false
  let buf: string[] = []

  const flush = () => {
    const content = buf.join('\n').trim()
    if (curTitle !== null) {
      chapters.push({ title: curTitle.slice(0, TITLE_MAX), content, isVolume: curIsVolume })
    } else if (content) {
      if (keepPrologue) chapters.push({ title: '序章', content })
      else buf = content.split('\n') // 暂存，并入第一章
    }
  }

  for (const line of lines) {
    const stripped = stripDecor(line.trim())

    // 卷行旁路识别：当当前切分模式不是卷模式本身时，卷行单独成章
    const volMatch = stripped.match(VOLUME_REGEX)
    const isVolumeLine = !!volMatch && !regex.source.includes('卷')
    const m = stripped.match(regex)

    if (isVolumeLine) {
      // 卷行同样支持 keepPrologue=false：开头正文并入首个卷章
      const pending = curTitle === null && !keepPrologue && buf.join('\n').trim() ? buf.join('\n').trim() : null
      flush()
      curTitle = volMatch![1].trim()
      curIsVolume = true
      buf = pending ? [pending] : []
    } else if (m) {
      const pending = curTitle === null && !keepPrologue && buf.join('\n').trim() ? buf.join('\n').trim() : null
      flush()
      curTitle = m[1].trim()
      curIsVolume = false
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
