// 章节切分——M1 文档 §3.2 预设正则 + 自动检测 + 卷/前缀处理
//
// 核心机制（2026-06-19 重构）：放弃「行首锚定」，改「行内任意位置查找 + 标题前置截断」。
// 真实乱序 raw 文本里，标题可能① 前面带 emoji/装饰符号（stripDecor 剥不全），② 粘在上一章
// 正文末尾同一行（如「可轻松切断任何常规金属。第3章 接受现实」）。`^` 行首锚两者都救不了。
// 解决：存储形保留 `^`（用户编辑体验不变），编译时剥锚成「行内搜索形」，匹配后用「句末标点
// 护栏」区分干净标题行与正文引用，标题前文字归入上一章。

import type { SplitPattern as StoredSplitPattern } from '../services/types'

/** 持久化形态（regex 为字符串，存 settings.json） */
export type { SplitPattern as StoredSplitPattern } from '../services/types'

/** 检测/切分时使用的运行时形态：regex 已编译为「行内搜索形」RegExp（custom 为 null） */
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
  { key: 'maohao',  label: '数字+冒号（001：标题）', regex: '^(\\d{1,4}[:：].*)', builtin: true },
  { key: 'custom',  label: '自定义正则', regex: '', builtin: true },
]

/** 内置卷正则（旁路识别卷行，独立于用户当前选的模式）—— 存储形（带 ^），转搜索形时用 */
const VOLUME_SOURCE = '^(第[0-9零一二三四五六七八九十百千万]+卷.*)'

/**
 * 散落装饰符号（爱心/星号/方框/序号圈/书名号/括号 + 空白），均为 BMP 范围。
 * 仅剥**行首前导**符号（regex 带 ^），剥到遇到「第/数字/Chapter」即停；
 * 正文行内的 emoji 不受影响（content buffer 存原始 line，只有标题提取用 stripped）。
 *
 * astral emoji 与变体选择符单独用属性转义处理（DECOR_EMOJI / DECOR_VS），
 * 避免在字符类里混入代理对 / combining mark 触发 no-misleading-character-class。
 * 半角方括号用 \u005B / \u005D 表达（字符类内裸 [ ] 在 u-flag 下非法，转义又触发
 * no-useless-escape，unicode 转义两全其美）。
 */
const DECOR_SYMBOLS = /^[\s☆★◆●○■□※▪♦♥♠♣①-⑳Ⅰ-Ⅻ【】\u005B\u005D「」『』《》（）()\u2600-\u27BF\u2B00-\u2BFF]+/

/** 行首图形 emoji（astral plane，如 👍🎉）—— 属性转义，避开代理对范围 */
const DECOR_EMOJI = /^\p{Extended_Pictographic}+/u

/** 行首变体选择符（U+FE00–FE0F，不可见格式字符）—— 属性转义，避开 combining mark 字符类 */
const DECOR_VS = /^\p{Variation_Selector}+/u

/**
 * 剥除标题行前的装饰前缀。支持两类：
 * ① 成对符号包裹的任意内容块（如 [爱心]、【公告】、（注）），内容可含中文；
 * ② 散落的单个装饰符号（含 emoji / 变体选择符）+ 空白。
 * 两类交替反复剥除，直到剩下章节正文。
 */
const DECOR_BLOCK = /^(\[[^\]]*\]|【[^】]*】|（[^）]*）|\([^)]*\)|「[^」]*」|『[^』]*』|《[^》]*》)/

function stripDecor(s: string): string {
  let out = s
  // 反复剥：每轮先剥成对包裹块、emoji、变体选择符、散落符号；都不再变化时停止
  for (let i = 0; i < 10; i++) {
    const before = out
    out = out.replace(DECOR_BLOCK, '')
    out = out.replace(DECOR_EMOJI, '')
    out = out.replace(DECOR_VS, '')
    out = out.replace(DECOR_SYMBOLS, '')
    if (out === before) break
  }
  return out
}

/**
 * 把存储形正则（带 ^）转成「行内搜索形」编译。
 * 剥掉开头的 `^` 锚（若有），其余原样。`flags` 透传。
 * 编译失败返回 null。
 */
export function toSearchRegex(source: string, flags?: string): RegExp | null {
  if (!source) return null
  // 去掉开头的 ^ 锚（可能前后有空白/分组起点的细微差异，统一处理行首锚）
  const stripped = source.replace(/^\s*\^/, '')
  try {
    return new RegExp(stripped, flags)
  } catch {
    return null
  }
}

/**
 * 把存储形态（regex 字符串）编译为运行时形态（regex 为行内搜索形 RegExp）。
 * custom 模式或编译失败 → regex 为 null。
 */
export function compilePatterns(stored: StoredSplitPattern[]): SplitPattern[] {
  return stored.map((p) => {
    if (p.key === 'custom' || !p.regex) return { ...p, regex: null }
    return { ...p, regex: toSearchRegex(p.regex, p.flags) }
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

/**
 * 句末标点（标题前若是这些字符之一，则视为上一章正文自然结束、标题可在此截断开新章）。
 * 用于区分「正文自然结束 + 标题粘连」与「正文引用第N章」（如「他翻到第三章」）。
 * 前一字符非句末标点时，命中判为正文引用、不切分。
 *
 * 含中文成对引号的**闭引号**（U+201D ” / U+2019 ’）：中文小说对话常以「～"」「。"」收尾后
 * 紧跟下一章标题（如 `…幸运观众～"第2章 名为日常的崩坏`），闭引号等同于句末标点。
 * 开引号（U+201C “ / U+2018 ‘）不加入——开引号后接标题意味着对话刚开头，非章节边界。
 */
const SENTENCE_END = new Set('。！？!?…」』)）"』】》>.;\u201D\u2019')

export interface TitleHit {
  /** 标题在行内的起始偏移（stripDecor 后的坐标系） */
  index: number
  /** 标题前文字（归入上一章） */
  prefix: string
  /** 标题文本（已截断 TITLE_MAX） */
  title: string
}

/**
 * 在一行内查找章节标题。返回 {index, prefix, title} 或 null。
 *
 * 边界护栏：命中若在行内非开头位置（index > 0），要求前一字符是句末标点
 * （见 SENTENCE_END），否则判为正文引用（如「他翻到第三章」）、返回 null。
 * 命中在 index 0 = 干净标题行（stripDecor 后），直接通过。
 *
 * 标题捕获组：优先 m[1]（首个捕获组，预设正则均含），否则 m[0]。
 */
export function findTitleInLine(line: string, searchRegex: RegExp): TitleHit | null {
  const m = line.match(searchRegex)
  if (!m || typeof m.index !== 'number') return null
  const idx = m.index
  // 行内非开头位置：必须有句末标点背书，否则判正文引用
  if (idx > 0) {
    const prev = line[idx - 1]
    if (!SENTENCE_END.has(prev)) return null
  }
  const rawTitle = (m[1] ?? m[0]).replace(/\s+/g, ' ').trim()
  if (!rawTitle) return null
  return {
    index: idx,
    prefix: line.slice(0, idx).trim(),
    title: rawTitle.slice(0, TITLE_MAX),
  }
}

/**
 * 检测文本开头是否为章节标题行（用于人工拆分后自动命名新章）。
 *
 * 用户在预览里点光标拆分时，拆分位置往往是「没切好的章节边界」——其后的内容本身
 * 可能就是一段被并到上一章的真实标题行（如 `第3章 新的展开\n正文…`）。此时直接复用
 * 自动检测算法提取该标题作为新章标题，比默认 `原标题（续）` 更准确。
 *
 * 取首条非空行，stripDecor 后对内置模式逐个 findTitleInLine：
 *  - 命中（首行 index 0 不需要句末标点背书）→ 返回该标题，并把首行剥离后作为 content
 *  - 首行无命中 → 返回 null（调用方回退到默认 `原标题（续）` 或用户输入）
 *
 * 注意：findTitleInLine 已处理「首行 index 0 = 干净标题行」与「句末标点护栏」，
 *       这里直接复用，保证拆分命名与自动检测口径一致。
 */
export function detectLeadingChapterTitle(
  content: string,
  stored: StoredSplitPattern[],
): { title: string; content: string } | null {
  if (!content) return null
  const patterns = compilePatterns(stored).filter((p) => p.key !== 'custom' && p.regex)
  // 取首条非空行（跳过拆分点附近可能残留的空白）
  const lines = content.split(/\r?\n/)
  let firstIdx = -1
  let firstLine = ''
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '') {
      firstIdx = i
      firstLine = lines[i]
      break
    }
  }
  if (firstIdx < 0) return null

  const stripped = stripDecor(firstLine.trim())
  for (const p of patterns) {
    const hit = findTitleInLine(stripped, p.regex!)
    if (hit) {
      // 命中标题在首行 index 0（stripDecor 后），整首行就是标题行 → 剥离该行作为新章 content
      // 若 index > 0 但有句末标点背书，prefix 归入上一章，此处首行仍当标题行处理
      const restLines = lines.slice(firstIdx + 1)
      const restContent = restLines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '')
      return { title: hit.title, content: restContent }
    }
  }
  return null
}

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
 * 逐行扫描，每行先 trim、剥装饰前缀，再用 findTitleInLine（行内查找 + 句末标点护栏）
 * 对每个非 custom 模式测试命中。取 hitCount >= MIN_HITS 的最大者；卷模式仅在无章类
 * 命中时作为兜底推荐。
 */
export function detectChapterPattern(text: string, stored: StoredSplitPattern[]): DetectResult {
  const patterns = compilePatterns(stored).filter((p) => p.key !== 'custom' && p.regex)
  const lines = text.split(/\r?\n/)

  const stats = patterns.map((p) => {
    let hit = 0
    const titles: string[] = []
    for (const raw of lines) {
      const stripped = stripDecor(raw.trim())
      const hitInfo = findTitleInLine(stripped, p.regex!)
      if (hitInfo) {
        hit++
        if (titles.length < 5) titles.push(hitInfo.title)
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

/**
 * 段落格式化（切分时即格式化）：
 * - 无空行 → 每个非空行视为独立段落，段间补 1 空行；
 * - 已有单空行 → 不动；
 * - 连续多空行 → 压成 1 个。
 * 仅规整空行，不碰行内内容（保留全角缩进、标点、作者文风，符合 M1 §3.7 红线）。
 */
export function normalizeParagraphs(content: string): string {
  if (!content) return content
  const lines = content.split(/\r?\n/)
  const out: string[] = []
  let blankRun = 0
  let sawAnyBlank = false
  for (const line of lines) {
    if (line.trim() === '') {
      blankRun++
      sawAnyBlank = true
    } else {
      // 处理累积的空行
      if (blankRun > 0) {
        // 有空行（原文已有段落分隔）→ 压成恰好 1 个
        out.push('')
        blankRun = 0
      } else if (out.length > 0) {
        // 前一行是非空、且原本无空行分隔 → 补 1 个空行作段落分隔
        out.push('')
      }
      out.push(line)
    }
  }
  // 全文无任何空行且只有一行时，无需补；多行已在循环里补过
  void sawAnyBlank
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '')
}

export interface SplitOptions {
  /** 保留旧签名占位；装饰前缀剥除是核心行为不可关闭 */
  stripDecorPrefix?: boolean
  /** 是否对每章 content 跑 normalizeParagraphs，默认 true */
  normalize?: boolean
}

/**
 * 按行扫描切分。匹配行（含行内标题，经 findTitleInLine + 句末标点护栏）视为新章标题；
 * 标题前的同行文字归入上一章。标题之前的内容按 keepPrologue 决定归入「序章」或并入第一章。
 * 无任何匹配时全文作为单章。
 *
 * 卷结构：当用户选的模式非卷模式时，仍用内置卷正则（行内搜索形）旁路识别卷行，
 * 卷行单独成一章（isVolume=true），其内容为卷行之后到下一个卷/章行之前的文本。
 * 标题前的装饰符号会被剥除。
 */
export function splitChapters(
  text: string,
  regex: RegExp,
  keepPrologue: boolean,
  options: SplitOptions = {},
): SplitResult[] {
  const normalizeEnabled = options.normalize !== false
  void options.stripDecorPrefix // 装饰前缀剥除是核心行为，保留签名兼容
  const lines = text.split(/\r?\n/)
  const chapters: SplitResult[] = []
  let curTitle: string | null = null
  let curIsVolume = false
  let buf: string[] = []

  // 卷正则编译为行内搜索形（当用户模式本身是卷模式时不旁路）
  const isVolumeMode = regex.source.includes('卷')
  const volumeSearch = toSearchRegex(VOLUME_SOURCE)

  const finalizeContent = (raw: string): string => {
    const trimmed = raw.trim()
    return normalizeEnabled ? normalizeParagraphs(trimmed) : trimmed
  }

  const flush = () => {
    const content = finalizeContent(buf.join('\n'))
    if (curTitle !== null) {
      chapters.push({ title: curTitle, content, isVolume: curIsVolume })
    } else if (content) {
      if (keepPrologue) {
        chapters.push({ title: '序章', content })
      }
      // keepPrologue=false：开头正文并入第一章，不在此 push，由 pending 暂存
    }
  }

  for (const line of lines) {
    const stripped = stripDecor(line.trim())

    // 卷行旁路识别（用户模式本身不是卷模式时）
    let volHit: TitleHit | null = null
    if (!isVolumeMode && volumeSearch) {
      volHit = findTitleInLine(stripped, volumeSearch)
    }
    const hit = findTitleInLine(stripped, regex)

    if (volHit) {
      // 标题前文字归上一章
      if (volHit.prefix) buf.push(volHit.prefix)
      // keepPrologue=false：开头正文并入首个卷章
      const pending = curTitle === null && !keepPrologue && buf.join('\n').trim() ? buf.join('\n').trim() : null
      flush()
      curTitle = volHit.title
      curIsVolume = true
      buf = pending ? [pending] : []
    } else if (hit) {
      if (hit.prefix) buf.push(hit.prefix)
      const pending = curTitle === null && !keepPrologue && buf.join('\n').trim() ? buf.join('\n').trim() : null
      flush()
      curTitle = hit.title
      curIsVolume = false
      buf = pending ? [pending] : []
    } else {
      buf.push(line)
    }
  }
  flush()

  if (chapters.length === 0) {
    return [{ title: '全文（未匹配到章节标题）', content: finalizeContent(text) }]
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
