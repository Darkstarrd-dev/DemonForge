// 规则清理引擎（原型，不依赖 LLM）——设计见 docs/M1_text_cleaning.md §3.9
// 核心机制：广告要传达群号，群号必然在文件内某处以可恢复形式明文出现（自锚定）。
// 块级广告提取载荷集 P → 字符按谐音/借形映射为数字影子 → 在影子中匹配 P 的碎片。
// 误删保护：锚点规则 + 自指语料复原验证；低置信一律只标记（suspects）不删。

export interface RuleCleanOptions {
  /** 自指复原验证：拼接处 n-gram 需在全文出现的次数（小样本用 1，整本书建议 2+） */
  minCorpusHits?: number
  /** 连续空行压缩为一个空行 */
  collapseBlankLines?: boolean
}

export interface NoiseSpan {
  line: number // 1-based 原始行号（0 = 全文级）
  excerpt: string
  reason: string
}

export interface RuleCleanResult {
  cleaned: string
  payloads: string[] // 自锚定提取出的广告号码（群号/qq）
  deletions: NoiseSpan[] // 已删除
  suspects: NoiseSpan[] // 低置信仅标记未删，交人工 diff 审核或 LLM 层
}

// ── 资产层：可按来源扩充的噪声库 ──

/** 零宽与方向控制符（样本已实证存在；保留 U+3000 全角缩进） */
export const INVISIBLE_RE = /[\u00AD\u200B-\u200F\u2060-\u2064\uFEFF]/g

/** 硬变体字：正文几乎不可能合法出现（群/说/小变体、独用偏旁、生僻借字） */
export const HARD_VARIANTS = new Set([...'羣峮囷箘宭裞仦氵亻衤児鸸飼'])

/** 软变体字：有合法用途（裙子、説、人名澪），仅邻接其他噪声证据时并入 */
export const SOFT_VARIANTS = new Set([...'裙説澪'])

/** 广告词：不单独触发删除，只用于噪声段贴边扩展与广告行判定（品牌词运行时自提取） */
export const AD_WORDS = ['小説羣', '仦裞羣', '小说群', '小説群', '裞羣', '小説', '中转', '备用', '外群']

/** 平台水印（白名单，整段删除） */
export const WATERMARK_RES = [/（看[^（）]{0,12}小说，就上[^（）]{0,16}）/g]

const AD_LINE_RES = [
  /https?:\/\/|www\./i,
  /访问密码|网盘地址/,
  /本作品来自互联网|请购买正版|仅供读者预览|不得用作商业用途/,
  /欢迎加入.{0,16}[群羣]|搜不到可以加/,
]
const AD_KEYWORD_RE = /备用|中转|外群|加群|群号|欢迎加入|小说[群羣]|小説[羣群]|ｑｑ|qq/i
const GROUP_CHAR_RE = /[群羣峮宭囷箘]|ｑｑ|qq/gi
const BRAND_RE = /[『（(](.{1,8}?)(?:小说群|小説群|书库)[』）)]/g
const HTML_TAG_RE = /<\/?[a-zA-Z!][^>]*>/g

// 数字映射：弱 = 正文常见字（仅作匹配证据），强 = 正文罕见形（可作锚点）。
// 十/百/千/万/亿 等量级字刻意不映射，保护「一千八百万」类真实数字。
const WEAK_SPEC: Array<[string, string]> = [
  ['〇零邻', '0'], ['一衣医易伊', '1'], ['二', '2'], ['三伞', '3'],
  ['四似寺私斯死', '4'], ['五', '5'], ['六柳榴硫流', '6'], ['七气漆', '7'],
  ['八扒吧爸芭坝', '8'], ['九久究韭疚酒', '9'],
]
const STRONG_SPEC: Array<[string, string]> = [
  ['⊙', '0'], ['壹吆幺', '1'], ['贰弍', '2'], ['叁彡', '3'], ['肆泗饲', '4'],
  ['伍', '5'], ['陆遛', '6'], ['柒', '7'], ['捌玐', '8'], ['玖镹', '9'],
]
const WEAK_DIGIT = new Map<string, string>()
const STRONG_DIGIT = new Map<string, string>()
for (const [chars, d] of WEAK_SPEC) for (const c of chars) WEAK_DIGIT.set(c, d)
for (const [chars, d] of STRONG_SPEC) for (const c of chars) STRONG_DIGIT.set(c, d)

const PINYIN_DIGIT: Record<string, string> = {
  ling: '0', yi: '1', er: '2', san: '3', si: '4', wu: '5', liu: '6', qi: '7', ba: '8', jiu: '9',
}
const ROMAN_DIGIT: Record<string, string> = { II: '2', III: '3', IV: '4', VI: '6', VII: '7', VIII: '8', IX: '9' }

const GAP_MAX = 8 // 载荷碎片间允许的正常字符间隔
const SEQ_MIN = 5 // 子序列匹配最少位数
const UNIT_CHARS = 'kK千万亿年月日时分秒章卷回%‰小点'

// ── 字符分类 ──

function circledDigit(cp: number): string | null {
  if (cp >= 0x2460 && cp <= 0x2468) return String(cp - 0x2460 + 1) // ①-⑨
  if (cp >= 0x2474 && cp <= 0x247c) return String(cp - 0x2474 + 1) // ⑴-⑼
  if (cp >= 0x2488 && cp <= 0x2490) return String(cp - 0x2488 + 1) // ⒈-⒐
  if (cp === 0x24ea) return '0'
  return null
}

function charDigit(ch: string): { d: string; strong: boolean } | null {
  if (ch >= '0' && ch <= '9') return { d: ch, strong: true }
  const cp = ch.codePointAt(0) ?? 0
  if (cp >= 0xff10 && cp <= 0xff19) return { d: String(cp - 0xff10), strong: true }
  const cd = circledDigit(cp)
  if (cd !== null) return { d: cd, strong: true }
  const s = STRONG_DIGIT.get(ch)
  if (s) return { d: s, strong: true }
  const w = WEAK_DIGIT.get(ch)
  if (w) return { d: w, strong: false }
  return null
}

function isWs(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '　'
}

function isJunkSym(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0
  if (cp > 0xffff) return true // 数学字母等非 BMP 装饰字符
  if (/[!-/:-@[-`{-~]/.test(ch)) return true
  return '°×·￥＄％＠＿－〜～'.includes(ch)
}

const PUNCT_RE = /[\s，。！？、；：…—·“”‘’,.!?;:'"~()（）【】《》『』-]/

// ── 影子序列 ──

interface Tok {
  s: number
  e: number
  d: string
  strong: boolean
}

function tokenize(line: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  while (i < line.length) {
    const ch = line[i]
    // 带括号数字（一）/(0)
    if ((ch === '（' || ch === '(') && i + 2 < line.length) {
      const close = ch === '（' ? '）' : ')'
      const inner = charDigit(line[i + 1])
      if (inner && line[i + 2] === close) {
        toks.push({ s: i, e: i + 3, d: inner.d, strong: true })
        i += 3
        continue
      }
    }
    // 字母串：拼音 / 罗马数字
    if (/[A-Za-z]/.test(ch)) {
      let j = i
      while (j < line.length && /[A-Za-z]/.test(line[j])) j++
      const run = line.slice(i, j)
      const py = PINYIN_DIGIT[run.toLowerCase()]
      const rom = ROMAN_DIGIT[run.toUpperCase()]
      if (py && run.length >= 2) toks.push({ s: i, e: j, d: py, strong: true })
      else if (rom) toks.push({ s: i, e: j, d: rom, strong: true })
      i = j
      continue
    }
    const d = charDigit(ch)
    if (d) toks.push({ s: i, e: i + 1, d: d.d, strong: d.strong })
    i++
  }
  return toks
}

function subInPayload(digits: string, minLen: number, payloads: string[]): boolean {
  for (let len = digits.length; len >= minLen; len--) {
    for (let k = 0; k + len <= digits.length; k++) {
      const sub = digits.slice(k, k + len)
      if (payloads.some((p) => p.includes(sub))) return true
    }
  }
  return false
}

function countOccur(corpus: string, s: string): number {
  let n = 0
  let i = corpus.indexOf(s)
  while (i !== -1) {
    n++
    i = corpus.indexOf(s, i + 1)
  }
  return n
}

/** 复原验证：删除 [s,e) 后拼接处的二元组需在全文他处出现（标点/边界直接通过） */
function junctionOk(line: string, s: number, e: number, corpus: string, minHits: number): boolean {
  let i = s - 1
  while (i >= 0 && isWs(line[i])) i--
  let j = e
  while (j < line.length && isWs(line[j])) j++
  const prev = i >= 0 ? line[i] : ''
  const next = j < line.length ? line[j] : ''
  if (!prev || !next) return true
  if (PUNCT_RE.test(prev) || PUNCT_RE.test(next)) return true
  return countOccur(corpus, prev + next) >= minHits
}

interface Range {
  s: number
  e: number
  reason: string
}

function mergeRanges(ranges: Range[]): Range[] {
  if (!ranges.length) return ranges
  const sorted = [...ranges].sort((a, b) => a.s - b.s)
  const out: Range[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1]
    if (sorted[i].s <= last.e) last.e = Math.max(last.e, sorted[i].e)
    else out.push(sorted[i])
  }
  return out
}

/** 噪声段贴边扩展：吸收变体字/强数字/符号/空白；弱数字与标点作暂存，远端仍是噪声才并入 */
function extendSpan(line: string, s: number, e: number, adWords: string[]): [number, number] {
  const isCore = (ch: string) =>
    HARD_VARIANTS.has(ch) || SOFT_VARIANTS.has(ch) || isWs(ch) || isJunkSym(ch) ||
    (charDigit(ch)?.strong ?? false)
  const isHold = (ch: string) => {
    const d = charDigit(ch)
    if (d && !d.strong) return true
    return /[。，！？、；：…—.]/.test(ch) // 引号是句子结构，不可吸收
  }
  const adAtLeft = (pos: number): number => {
    for (const w of adWords) {
      for (let ov = 1; ov <= w.length; ov++) {
        if (pos - ov >= 0 && line.startsWith(w, pos - ov)) return ov
      }
    }
    return 0
  }
  const adAtRight = (pos: number): number => {
    for (const w of adWords) {
      for (let k = 0; k < w.length; k++) {
        if (pos - k >= 0 && line.startsWith(w, pos - k)) return w.length - k
      }
    }
    return 0
  }
  for (;;) {
    const ov = adAtLeft(s)
    if (ov > 0) {
      s -= ov
      continue
    }
    if (s > 0 && isCore(line[s - 1])) {
      s--
      continue
    }
    if (s > 0 && isHold(line[s - 1])) {
      let k = s - 1
      while (k > 0 && isHold(line[k - 1])) k--
      if (k > 0 && (isCore(line[k - 1]) || adAtLeft(k) > 0)) {
        s = k
        continue
      }
    }
    break
  }
  for (;;) {
    const ext = adAtRight(e)
    if (ext > 0) {
      e += ext
      continue
    }
    if (e < line.length && isCore(line[e])) {
      e++
      continue
    }
    if (e < line.length && isHold(line[e])) {
      let k = e + 1
      while (k < line.length && isHold(line[k])) k++
      if (k < line.length && (isCore(line[k]) || adAtRight(k) > 0)) {
        e = k
        continue
      }
    }
    break
  }
  return [s, e]
}

// ── 行内清理 ──

interface LineResult {
  out: string
  dels: Array<{ excerpt: string; reason: string }>
  sus: Array<{ excerpt: string; reason: string }>
}

function cleanLine(
  line: string,
  payloads: string[],
  adWords: string[],
  corpus: string,
  minHits: number,
): LineResult {
  const dels: LineResult['dels'] = []
  const sus: LineResult['sus'] = []
  const ranges: Range[] = []

  // 章节标题中的数字保护区
  const zones: Array<[number, number]> = []
  {
    const re = /第[^章\n]{0,9}章/g
    let m: RegExpExecArray | null
    while ((m = re.exec(line))) zones.push([m.index, m.index + m[0].length])
  }
  const inZone = (s: number, e: number) => zones.some(([zs, ze]) => s < ze && e > zs)

  // 行内水印（白名单）
  for (const re of WATERMARK_RES) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(line))) ranges.push({ s: m.index, e: m.index + m[0].length, reason: 'watermark' })
  }

  const toks = tokenize(line).filter((t) => !inZone(t.s, t.e))

  // 载荷子序列匹配（碎片穿插）：≥SEQ_MIN 位按序命中且 ≥2 个强形式锚点
  for (const p of payloads) {
    for (let ti = 0; ti < toks.length; ti++) {
      const t = toks[ti]
      for (let j = 0; j < p.length; j++) {
        if (p[j] !== t.d) continue
        if (j > 0 && !t.strong) continue // 非首位起步仅允许强形式，防纯弱误配
        const got = [t]
        let pi = j + 1
        let last = t
        for (let k = ti + 1; k < toks.length && pi < p.length; k++) {
          const u = toks[k]
          if (u.s - last.e > GAP_MAX) break
          if (u.d === p[pi]) {
            got.push(u)
            pi++
            last = u
          }
        }
        if (got.length >= SEQ_MIN && got.filter((x) => x.strong).length >= 2) {
          for (const g of got) ranges.push({ s: g.s, e: g.e, reason: 'payload-seq' })
        }
      }
    }
  }

  // 连续影子链：解码为载荷子串则删除；3–5 位的短链先挂起，等邻接证据
  const chains: Tok[][] = []
  {
    let cur: Tok[] = []
    for (const t of toks) {
      if (cur.length && t.s === cur[cur.length - 1].e) cur.push(t)
      else {
        if (cur.length) chains.push(cur)
        cur = [t]
      }
    }
    if (cur.length) chains.push(cur)
  }
  const pending: Array<{ s: number; e: number }> = []
  for (const chain of chains) {
    let best: { s: number; e: number; len: number; strong: boolean } | null = null
    for (let len = chain.length; len >= 2 && !best; len--) {
      for (let k = 0; k + len <= chain.length; k++) {
        const slice = chain.slice(k, k + len)
        const digits = slice.map((t) => t.d).join('')
        if (!payloads.some((p) => p.includes(digits))) continue
        const strong = slice.every((t) => t.strong)
        if (len === 2 && !strong) continue // 2 位仅限纯强形式（ASCII/全角数字）
        best = { s: slice[0].s, e: slice[len - 1].e, len, strong }
        break
      }
    }
    if (!best) continue
    if (best.len >= 6 || (best.len >= 4 && best.strong)) ranges.push({ s: best.s, e: best.e, reason: 'payload-frag' })
    else pending.push({ s: best.s, e: best.e })
  }

  // 变体字噪声段
  const spanSus: Array<{ s: number; e: number }> = []
  {
    let idx = 0
    while (idx < line.length) {
      if (!HARD_VARIANTS.has(line[idx])) {
        idx++
        continue
      }
      let s = idx
      let e = idx + 1
      while (s > 0 && (HARD_VARIANTS.has(line[s - 1]) || SOFT_VARIANTS.has(line[s - 1]))) s--
      while (e < line.length && (HARD_VARIANTS.has(line[e]) || SOFT_VARIANTS.has(line[e]))) e++
      ;[s, e] = extendSpan(line, s, e, adWords)
      const spanToks = toks.filter((t) => t.s >= s && t.e <= e)
      const digits = spanToks.map((t) => t.d).join('')
      const hardN = [...line.slice(s, e)].filter((c) => HARD_VARIANTS.has(c)).length
      const high =
        hardN >= 2 || subInPayload(digits, 3, payloads) || ranges.length > 0
      if (high) ranges.push({ s, e, reason: 'variant' })
      else if (junctionOk(line, s, e, corpus, minHits)) ranges.push({ s, e, reason: 'variant+rejoin' })
      else spanSus.push({ s, e })
      idx = e
    }
  }
  for (const sp of spanSus) sus.push({ excerpt: line.slice(sp.s, sp.e).slice(0, 24), reason: 'variant?' })

  // 行首杂串：缩进后连续 ≥3 个噪声字符（含硬变体才删，否则只标记）
  {
    const indent = (line.match(/^\s*/) ?? [''])[0].length
    let k = indent
    while (
      k < line.length &&
      (isJunkSym(line[k]) || HARD_VARIANTS.has(line[k]) || SOFT_VARIANTS.has(line[k]) ||
        (charDigit(line[k])?.strong ?? false))
    ) k++
    const run = line.slice(indent, k)
    if (run.length >= 3 && !/^\.+$/.test(run)) {
      if ([...run].some((c) => HARD_VARIANTS.has(c))) ranges.push({ s: indent, e: k, reason: 'junk-prefix' })
      else sus.push({ excerpt: run.slice(0, 24), reason: 'junk-prefix?' })
    }
  }

  // 挂起短链：邻接（≤2 字符）已删噪声段则并入（迭代到不动点）
  let changed = true
  while (changed && pending.length) {
    changed = false
    const merged = mergeRanges(ranges)
    if (!merged.length) break
    for (let i = pending.length - 1; i >= 0; i--) {
      const c = pending[i]
      const dist = Math.min(
        ...merged.map((r) => (c.s >= r.e ? c.s - r.e : c.e <= r.s ? r.s - c.e : 0)),
      )
      if (dist <= 2) {
        ranges.push({ s: c.s, e: c.e, reason: 'payload-frag' })
        pending.splice(i, 1)
        changed = true
      }
    }
  }

  // 广告词连写（如 品牌词+中转）：仅当本行已有载荷证据时删除
  if (ranges.some((r) => r.reason.startsWith('payload'))) {
    for (let i = 0; i < line.length; i++) {
      for (const w1 of adWords) {
        if (!line.startsWith(w1, i)) continue
        for (const w2 of adWords) {
          if (w2 !== w1 && line.startsWith(w2, i + w1.length)) {
            ranges.push({ s: i, e: i + w1.length + w2.length, reason: 'adword-combo' })
          }
        }
      }
    }
  }

  // 合并 + 贴边扩展 + 再合并
  let finalRanges = mergeRanges(ranges)
  finalRanges = finalRanges.map((r) => {
    const [s, e] = extendSpan(line, r.s, r.e, adWords)
    return { s, e, reason: r.reason }
  })
  finalRanges = mergeRanges(finalRanges)

  // 数字嵌入正文的存疑串（未删，仅标记）：CJK 邻接、无单位、非载荷
  for (const chain of chains) {
    if (!chain.every((t) => t.strong)) continue
    const s = chain[0].s
    const e = chain[chain.length - 1].e
    if (chain.length < 2) continue
    if (finalRanges.some((r) => s < r.e && e > r.s)) continue
    if (inZone(s, e)) continue
    const next = line[e] ?? ''
    if (UNIT_CHARS.includes(next)) continue
    const prevCjk = s > 0 && /[一-鿿]/.test(line[s - 1])
    const nextCjk = e < line.length && /[一-鿿]/.test(next)
    if (prevCjk || nextCjk) sus.push({ excerpt: line.slice(Math.max(0, s - 3), Math.min(line.length, e + 3)), reason: 'digits-embedded' })
  }

  // 应用删除（右→左）
  let out = line
  for (let i = finalRanges.length - 1; i >= 0; i--) {
    const r = finalRanges[i]
    dels.push({ excerpt: line.slice(r.s, r.e).slice(0, 24), reason: r.reason })
    out = out.slice(0, r.s) + out.slice(r.e)
  }
  dels.reverse()

  // 密集符号杂讯：只标记不删（单一证据，交人工/LLM）
  {
    const runs = out.match(/[!-/:-@[-`{-~0-9A-Za-z°×￥·＄％＠＿]+/g) ?? []
    const junkLen = runs.reduce((n, r) => n + r.length, 0)
    const len = out.trim().length
    if (runs.length >= 5 && len > 0 && junkLen / len >= 0.12) {
      sus.push({ excerpt: out.trim().slice(0, 24), reason: 'symbol-noise' })
    }
  }

  return { out, dels, sus }
}

// ── 主流程 ──

export function ruleClean(text: string, opts: RuleCleanOptions = {}): RuleCleanResult {
  const minHits = opts.minCorpusHits ?? 1
  const collapse = opts.collapseBlankLines ?? true
  const deletions: NoiseSpan[] = []
  const suspects: NoiseSpan[] = []

  // 阶段0：不可见字符剥离
  const invisCount = (text.match(INVISIBLE_RE) ?? []).length
  const corpus = text.replace(INVISIBLE_RE, '')
  if (invisCount > 0) deletions.push({ line: 0, excerpt: `零宽/控制符 ×${invisCount}`, reason: 'invisible' })

  const lines = corpus.split('\n')
  const dropped = new Array<boolean>(lines.length).fill(false)
  const payloadSet = new Set<string>()
  const adWords = [...AD_WORDS]

  // 阶段1：块级广告识别 + 自锚定载荷/品牌提取
  for (let i = 0; i < lines.length; i++) {
    // HTML 标签剥离
    HTML_TAG_RE.lastIndex = 0
    if (HTML_TAG_RE.test(lines[i])) {
      const stripped = lines[i].replace(HTML_TAG_RE, '')
      deletions.push({ line: i + 1, excerpt: lines[i].trim().slice(0, 24), reason: 'html' })
      if (!stripped.trim()) {
        dropped[i] = true
        continue
      }
      lines[i] = stripped
    }
    const t = lines[i].trim()
    if (!t) continue
    if (AD_LINE_RES.some((re) => re.test(t))) {
      dropped[i] = true
      deletions.push({ line: i + 1, excerpt: t.slice(0, 24), reason: 'ad-block' })
      if (!/https?:\/\/|www\./i.test(t)) {
        for (const m of t.match(/\d{6,11}/g) ?? []) payloadSet.add(m)
      }
      BRAND_RE.lastIndex = 0
      let bm: RegExpExecArray | null
      while ((bm = BRAND_RE.exec(t))) if (!adWords.includes(bm[1])) adWords.push(bm[1])
      continue
    }
    // 群号行（含谐音混淆写法）：引号开头的对话行排除；
    // 明文群号+关键词直接判定，否则要求去掉关键词/数字/变体/符号后剩余正文字 ≤3
    if (t.length <= 40 && !/^[“‘「『]/.test(t)) {
      const toks = tokenize(t)
      const decoded = toks.map((k) => k.d).join('')
      const kw = AD_KEYWORD_RE.test(t)
      let isGroup = kw && /\d{6,11}/.test(t)
      if (!isGroup && decoded.length >= 6 && (kw || [...t].some((ch) => HARD_VARIANTS.has(ch)))) {
        const mask = new Array<boolean>(t.length).fill(false)
        for (const k of toks) for (let x = k.s; x < k.e; x++) mask[x] = true
        const kwre = new RegExp(AD_KEYWORD_RE.source, 'gi')
        let km: RegExpExecArray | null
        while ((km = kwre.exec(t))) for (let x = km.index; x < km.index + km[0].length; x++) mask[x] = true
        let rest = 0
        for (let x = 0; x < t.length; x++) {
          if (mask[x]) continue
          const ch = t[x]
          if (isWs(ch) || isJunkSym(ch) || HARD_VARIANTS.has(ch) || SOFT_VARIANTS.has(ch)) continue
          if (/[一-鿿]/.test(ch)) rest++
        }
        isGroup = rest <= 3
      }
      if (isGroup) {
        dropped[i] = true
        deletions.push({ line: i + 1, excerpt: t.slice(0, 24), reason: 'ad-group' })
        const plain = t.match(/\d{6,11}/g)
        if (plain) plain.forEach((p) => payloadSet.add(p))
        else {
          GROUP_CHAR_RE.lastIndex = 0
          let kwEnd = 0
          let gm: RegExpExecArray | null
          while ((gm = GROUP_CHAR_RE.exec(t))) kwEnd = gm.index + gm[0].length
          const tail = toks.filter((k) => k.s >= kwEnd).map((k) => k.d).join('')
          if (tail.length >= 6 && tail.length <= 11) payloadSet.add(tail)
        }
        BRAND_RE.lastIndex = 0
        let bm: RegExpExecArray | null
        while ((bm = BRAND_RE.exec(t))) if (!adWords.includes(bm[1])) adWords.push(bm[1])
        continue
      }
    }
    // 纯杂讯行（全部字符可映射为数字/符号/变体，解码 ≥6 位；1–4 位纯数字可能是章节标题，跳过）
    if (!/^[0-9０-９]{1,4}$/.test(t)) {
      const toks = tokenize(t)
      const covered = new Array<boolean>(t.length).fill(false)
      for (const k of toks) for (let x = k.s; x < k.e; x++) covered[x] = true
      const allJunk = [...t].every(
        (c, x) => covered[x] || isWs(c) || isJunkSym(c) || HARD_VARIANTS.has(c) || SOFT_VARIANTS.has(c),
      )
      const decoded = toks.map((k) => k.d).join('')
      if (allJunk && decoded.length >= 6 && toks.filter((k) => k.strong).length >= 3) {
        dropped[i] = true
        deletions.push({ line: i + 1, excerpt: t.slice(0, 24), reason: 'junk-line' })
        continue
      }
    }
  }

  // 阶段1b：广告块上下文行（夹在已删广告行之间的短关键词行）
  for (let i = 0; i < lines.length; i++) {
    if (dropped[i]) continue
    const t = lines[i].trim()
    if (!t || t.length > 60) continue
    if (!/[群羣]|资源|书库|网盘|正版/.test(t)) continue
    const nearAd = (from: number, to: number) => {
      for (let k = from; k <= to; k++) {
        if (k >= 0 && k < lines.length && dropped[k] && lines[k].trim()) return true
      }
      return false
    }
    if (nearAd(i - 2, i - 1) && nearAd(i + 1, i + 2)) {
      dropped[i] = true
      deletions.push({ line: i + 1, excerpt: t.slice(0, 24), reason: 'ad-context' })
    }
  }

  const payloads = [...payloadSet]

  // 阶段5：行首藏号（竖排）——连续 ≥4 行行首字可疑率 ≥75%，纵读须命中载荷或含 ≥2 硬变体
  {
    const adwordChars = new Set([...adWords.join('')])
    const flushRun = (s: number, e: number) => {
      const n = e - s
      if (n < 4) return
      const first = []
      for (let i = s; i < e; i++) {
        const pos = (lines[i].match(/^\s*/) ?? [''])[0].length
        first.push({ idx: i, ch: lines[i][pos] ?? '', pos })
      }
      const isSusp = (ch: string) =>
        HARD_VARIANTS.has(ch) || SOFT_VARIANTS.has(ch) || charDigit(ch) !== null || adwordChars.has(ch)
      const suspCount = first.filter((f) => isSusp(f.ch)).length
      if (suspCount / n < 0.75) return
      const vertical = first.map((f) => charDigit(f.ch)?.d ?? '').join('')
      let gate = first.filter((f) => HARD_VARIANTS.has(f.ch)).length >= 2
      for (let k = 0; k + 4 <= vertical.length && !gate; k++) {
        const sub = vertical.slice(k, k + 4)
        gate = payloads.some((p) => p.includes(sub))
      }
      if (!gate) {
        suspects.push({ line: s + 1, excerpt: first.map((f) => f.ch).join('').slice(0, 24), reason: 'acrostic?' })
        return
      }
      for (const f of first) {
        if (!isSusp(f.ch)) continue
        lines[f.idx] = lines[f.idx].slice(0, f.pos) + lines[f.idx].slice(f.pos + 1)
        deletions.push({ line: f.idx + 1, excerpt: f.ch, reason: 'acrostic' })
      }
    }
    let runStart = -1
    for (let i = 0; i <= lines.length; i++) {
      const ok = i < lines.length && !dropped[i] && lines[i].trim() !== ''
      if (ok && runStart === -1) runStart = i
      if (!ok && runStart !== -1) {
        flushRun(runStart, i)
        runStart = -1
      }
    }
  }

  // 行内清理
  for (let i = 0; i < lines.length; i++) {
    if (dropped[i] || !lines[i].trim()) continue
    const { out, dels, sus } = cleanLine(lines[i], payloads, adWords, corpus, minHits)
    for (const d of dels) deletions.push({ line: i + 1, ...d })
    for (const s of sus) suspects.push({ line: i + 1, ...s })
    if (!out.trim()) dropped[i] = true
    else lines[i] = out
  }

  let cleaned = lines.filter((_, i) => !dropped[i]).join('\n')
  if (collapse) cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

  return { cleaned, payloads, deletions, suspects }
}
