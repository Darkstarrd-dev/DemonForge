// 架构 / 蓝图文本解析（纯函数，可单测）。
// 后端 ARCH_SYSTEM_PROMPT 强制输出 ## 核心种子 / ## 角色动力学 / ## 世界观 / ## 三幕式情节 四分区；
// BLUEPRINT_SYSTEM_PROMPT 强制每章固定块 + 六字段行。

export interface ParsedArchitecture {
  seed: string
  characterDynamics: string
  worldBuilding: string
  plotStructure: string
}

/** 区标题别名 → 分区键（容错模型可能输出"核心种子"/"种子"等变体） */
const ARCH_SECTION_MAP: Record<string, keyof ParsedArchitecture> = {
  核心种子: 'seed',
  种子: 'seed',
  角色动力学: 'characterDynamics',
  角色动态: 'characterDynamics',
  世界观: 'worldBuilding',
  世界构建: 'worldBuilding',
  三幕式情节: 'plotStructure',
  三幕式: 'plotStructure',
  情节架构: 'plotStructure',
}

/**
 * 按 `## ` 二级标题切分架构文本为四分区。
 * 匹配不到的标题归入"其他"（拼到末尾，避免内容丢失）；完全无分区时整体塞进 seed。
 */
export function parseArchitecture(text: string): ParsedArchitecture {
  const result: ParsedArchitecture = { seed: '', characterDynamics: '', worldBuilding: '', plotStructure: '' }
  const lines = text.replace(/\r\n/g, '\n').split('\n')

  let current: keyof ParsedArchitecture | null = null
  const others: string[] = []

  for (const line of lines) {
    const m = line.match(/^#{1,3}\s*(.+?)\s*#*\s*$/)
    if (m) {
      const title = m[1].trim()
      // 取去掉括号/冒号后注释的纯标题做匹配
      const bare = title.replace(/[（(].*$/, '').replace(/[:：].*$/, '').trim()
      const key = ARCH_SECTION_MAP[bare] ?? ARCH_SECTION_MAP[title]
      if (key) {
        current = key
        continue
      }
      // 形如标题但未命中映射——当作普通内容归入当前分区
    }
    const target = current ?? null
    if (target) {
      result[target] += (result[target] ? '\n' : '') + line
    } else {
      others.push(line)
    }
  }

  const otherText = others.join('\n').trim()
  if (otherText && !result.seed && !result.characterDynamics && !result.worldBuilding && !result.plotStructure) {
    // 完全无分区：整体塞进 seed
    result.seed = otherText
  }

  // 各分区首尾 trim
  ;(Object.keys(result) as (keyof ParsedArchitecture)[]).forEach((k) => {
    result[k] = result[k].trim()
  })
  return result
}

export interface ParsedBlueprintChapter {
  order: number
  title: string
  summary: string
  positioning?: string
  role?: string
  suspenseDensity?: string
  foreshadow?: string
  twistLevel?: number
}

/** 取行字段值：匹配 `字段名：` 或 `字段名:` 后的内容 */
function field(text: string, name: string): string | undefined {
  const re = new RegExp(`^${name}\\s*[:：]\\s*(.+?)\\s*$`, 'm')
  const m = text.match(re)
  return m ? m[1].trim() : undefined
}

/** 认知颠覆行 → 数 ★（1–5）；无则 undefined */
function parseTwist(text: string): number | undefined {
  const raw = field(text, '认知颠覆')
  if (!raw) return undefined
  const stars = (raw.match(/★/g) ?? []).length
  if (stars > 0) return Math.min(5, Math.max(1, stars))
  // 兜底：纯数字
  const n = Number(raw.replace(/[^0-9]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.min(5, Math.max(1, Math.round(n))) : undefined
}

/**
 * 按章节块解析蓝图。块起点：行首 `第N章`（N 为数字/一二三…）。
 * 每块提取标题（章号后到行尾）与六字段。
 */
export function parseBlueprint(text: string): ParsedBlueprintChapter[] {
  const chapters: ParsedBlueprintChapter[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')

  // 章节块起点行：第N章 [标题]  ——允许"第N章 - 标题""第N章：标题"等分隔
  const chapterStartRe = /^第\s*([0-9一二三四五六七八九十百零〇]+)\s*章\s*[：:、\-—\s]*(.*)$/

  let cur: { order: number; title: string; body: string[] } | null = null

  const cn2num = (s: string): number => {
    const n = parseInt(s, 10)
    if (!Number.isNaN(n)) return n
    const map = '零一二三四五六七八九'
    let total = 0
    const ten = s.indexOf('十')
    if (ten >= 0) {
      const before = ten > 0 ? map.indexOf(s[ten - 1]) : 1
      total += (before > 0 ? before : 1) * 10
      const after = s.slice(ten + 1)
      if (after) total += map.indexOf(after[0])
      return total
    }
    for (const ch of s) {
      const idx = map.indexOf(ch)
      if (idx >= 0) total = total * 10 + idx
    }
    return total
  }

  for (const line of lines) {
    const m = line.match(chapterStartRe)
    if (m) {
      // 落盘上一块
      if (cur) {
        chapters.push(parseChapterBlock(cur.order, cur.title, cur.body.join('\n')))
      }
      cur = { order: cn2num(m[1]), title: m[2].trim(), body: [] }
      continue
    }
    if (cur) cur.body.push(line)
  }
  if (cur) chapters.push(parseChapterBlock(cur.order, cur.title, cur.body.join('\n')))

  return chapters.filter((c) => c.order > 0)
}

function parseChapterBlock(order: number, title: string, body: string): ParsedBlueprintChapter {
  return {
    order,
    title: title || `第${order}章`,
    summary: field(body, '简述') ?? '',
    positioning: field(body, '定位') ?? field(body, '本章定位'),
    role: field(body, '核心作用'),
    suspenseDensity: field(body, '悬念密度'),
    foreshadow: field(body, '伏笔') ?? field(body, '伏笔操作'),
    twistLevel: parseTwist(body),
  }
}
