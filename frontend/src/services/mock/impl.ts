// mock 实现：一切 LLM 介入点的假反馈。后续接真后端时整目录替换为 fetch 实现。
import type { Chapter, ConsistencyIssue, EntityCard, SimScene, StateEvent } from '../types'
import { mockDelay, mockStream, type StreamHandle } from '../../utils/mockStream'
import { mockCleanChapter } from '../../mocks/demoRaw'
import { genId } from '../../store/appStore'

// ===== M1：AI 拆分合并章节（mock：固定从中间拆两章，演示协议结果） =====

export async function aiSplitChapter(
  title: string,
  content: string,
): Promise<{ title: string; content: string }[]> {
  await mockDelay(1200)
  const lines = content.split('\n').filter((l) => l.trim())
  if (lines.length < 4) return [{ title, content }]
  const mid = Math.ceil(lines.length / 2)
  return [
    { title: `${title}（上）`, content: lines.slice(0, mid).join('\n') },
    { title: `${title}（下）`, content: lines.slice(mid).join('\n') },
  ]
}

// ===== M1：清理任务队列（模拟 N worker 并发 + 流式输出） =====

export interface CleanQueueCallbacks {
  onStart: (chapterId: string, nodeName: string) => void
  onChunk: (chapterId: string, acc: string) => void
  onDone: (chapterId: string, cleaned: string) => void
  onFinish: () => void
}

export interface CleanQueueHandle {
  pause: () => void
  resume: () => void
  stop: () => void
}

export function startCleanQueue(
  chapters: { id: string; content: string }[],
  nodeNames: string[],
  cb: CleanQueueCallbacks,
  concurrency = 3,
): CleanQueueHandle {
  const queue = [...chapters]
  let paused = false
  let stopped = false
  let active = 0
  let finished = false
  const streams = new Map<string, StreamHandle>()

  const maybeFinish = () => {
    if (!finished && active === 0 && (queue.length === 0 || stopped)) {
      finished = true
      cb.onFinish()
    }
  }

  const worker = async (idx: number) => {
    while (!stopped) {
      if (paused) {
        await mockDelay(200)
        continue
      }
      const task = queue.shift()
      if (!task) break
      active += 1
      const nodeName = nodeNames.length ? nodeNames[idx % nodeNames.length] : '默认节点'
      cb.onStart(task.id, nodeName)
      const target = mockCleanChapter(task.content)
      const handle = mockStream(target, (acc) => cb.onChunk(task.id, acc), {
        chunkMs: 12,
        chunkSize: 6,
      })
      streams.set(task.id, handle)
      const result = await handle.promise
      streams.delete(task.id)
      if (!stopped) cb.onDone(task.id, result)
      active -= 1
    }
    maybeFinish()
  }

  for (let i = 0; i < concurrency; i++) void worker(i)

  return {
    pause: () => (paused = true),
    resume: () => (paused = false),
    stop: () => {
      stopped = true
      queue.length = 0
      streams.forEach((s) => s.cancel())
    },
  }
}

// ===== M2：设定提取（伪提取器：对任意章节文本做规则统计，演示效果真实） =====

export async function extractEntities(
  bookId: string,
  chapters: Chapter[],
  existingNames: string[],
): Promise<EntityCard[]> {
  await mockDelay(1800)
  const nameFreq = new Map<string, { count: number; ref: { chapterId: string; excerpt: string } }>()
  const locFreq = new Map<string, { count: number; ref: { chapterId: string; excerpt: string } }>()

  for (const ch of chapters) {
    for (const line of ch.content.split('\n')) {
      for (const m of line.matchAll(/([一-龥]{2,3})(?:说|道|笑|问|喝道|沉声|低声|开口)/g)) {
        const name = m[1].replace(/^(的|地|了|着)/, '')
        if (name.length < 2) continue
        const e = nameFreq.get(name)
        if (e) e.count += 1
        else nameFreq.set(name, { count: 1, ref: { chapterId: ch.id, excerpt: line.trim().slice(0, 60) } })
      }
      for (const m of line.matchAll(/([一-龥]{2,4}(?:城|村|山|阁|寺|镇|巷|原|关|宫|楼))/g)) {
        const e = locFreq.get(m[1])
        if (e) e.count += 1
        else locFreq.set(m[1], { count: 1, ref: { chapterId: ch.id, excerpt: line.trim().slice(0, 60) } })
      }
    }
  }

  const now = new Date().toISOString()
  const cards: EntityCard[] = []
  const topNames = [...nameFreq.entries()]
    .filter(([n, v]) => v.count >= 2 && !existingNames.includes(n))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 4)
  for (const [name, v] of topNames) {
    cards.push({
      id: genId('card'),
      bookId,
      type: 'character',
      name,
      aliases: [],
      fields: { 身份: '（mock 提取，待人工补充）' },
      description: `在所选章节中出现 ${v.count} 次对话引导（mock 规则提取，待人工修正）。`,
      refs: [v.ref],
      updatedAt: now,
    })
  }
  const topLocs = [...locFreq.entries()]
    .filter(([n, v]) => v.count >= 2 && !existingNames.includes(n))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)
  for (const [name, v] of topLocs) {
    cards.push({
      id: genId('card'),
      bookId,
      type: 'location',
      name,
      aliases: [],
      fields: { 区域: '（待人工补充）' },
      description: `在所选章节中出现 ${v.count} 次（mock 规则提取，待人工修正）。`,
      refs: [v.ref],
      updatedAt: now,
    })
  }
  return cards
}

// ===== M3：单角色推演（模板化假候选，流式输出） =====

function buildCandidate(
  card: EntityCard,
  scene: SimScene,
  variant: number,
): string {
  const example = card.styleExamples?.[variant % (card.styleExamples.length || 1)] ?? ''
  const styleHint = card.styleNote ? `（${card.styleNote.split('；')[0]}）` : ''
  if (variant === 0) {
    return (
      `${card.name}沉默了片刻，目光扫过眼前的一切。\n` +
      `场景中——${scene.desc.slice(0, 40)}……\n` +
      `"${example || '……'}"${card.name}最终开口，声音不高${styleHint}。\n` +
      `这一句之后，${card.name}朝着目标迈出了第一步：${scene.goal.slice(0, 30)}。\n` +
      `【mock 候选 A：基于角色卡风格描述与例句模板生成】`
    )
  }
  return (
    `风声里，${card.name}先做了一个出乎所有人意料的动作。\n` +
    `${card.name}没有立刻说话——${card.styleNote?.slice(0, 24) ?? '性格使然'}。\n` +
    `半晌，才落下一句："${example || '……'}"\n` +
    `在场众人这才明白，${card.name}早已把局面看穿。\n` +
    `【mock 候选 B：另一种反应路径，供对比挑选】`
  )
}

export async function simulateCharacter(
  scene: SimScene,
  card: EntityCard,
  onChunk: (candidateIdx: number, acc: string) => void,
): Promise<{ id: string; text: string }[]> {
  const results: { id: string; text: string }[] = []
  for (let v = 0; v < 2; v++) {
    const text = buildCandidate(card, scene, v)
    const handle = mockStream(text, (acc) => onChunk(v, acc), { chunkMs: 18, chunkSize: 3 })
    const final = await handle.promise
    results.push({ id: genId('cand'), text: final })
  }
  return results
}

// ===== M4：章节生成（串联硬约束片段 + 模板过渡，流式） =====

export async function generateChapterDraft(
  params: {
    outlineTitle: string
    outlineSummary: string
    fragments: string[]
    prevSummary: string
  },
  onChunk: (acc: string) => void,
): Promise<string> {
  const open = `（承接前章：${params.prevSummary.slice(0, 50)}……）\n\n雪后的天光透进来时，临渊城仍未从昨夜缓过气来。\n`
  const body = params.fragments.length
    ? params.fragments
        .map(
          (f, i) =>
            `${f}\n\n${i < params.fragments.length - 1 ? '城头的风换了方向，把下一段对话送到了更远的地方。\n' : ''}`,
        )
        .join('\n')
    : '（本章未引用任何推演片段，以下为大纲直接展开。）\n'
  const close = `\n这一章按大纲「${params.outlineTitle}」收束：${params.outlineSummary}\n\n【mock 草稿：硬约束片段已逐字保留，过渡句为模板生成，待人工编辑】`
  const full = open + body + close
  const handle = mockStream(full, onChunk, { chunkMs: 10, chunkSize: 6 })
  return handle.promise
}

// ===== M5：一致性检查（含一条真规则：已死角色再出场） =====

export async function checkConsistency(
  bookId: string,
  chapter: Chapter,
  cards: EntityCard[],
  stateEvents: StateEvent[],
  presetIssues: ConsistencyIssue[],
): Promise<ConsistencyIssue[]> {
  await mockDelay(1500)
  const found: ConsistencyIssue[] = presetIssues.filter(
    (i) => i.chapterId === chapter.id && i.status === 'open',
  )
  // 真规则演示：state_event 中已死亡角色的名字出现在本章 → error
  const deadEvents = stateEvents.filter((e) => e.bookId === bookId && e.eventType === 'death')
  for (const ev of deadEvents) {
    if (ev.chapterId === chapter.id) continue
    const card = cards.find((c) => c.id === ev.entityId)
    if (!card) continue
    if (chapter.content.includes(card.name) && !found.some((i) => i.relatedCardIds.includes(card.id))) {
      found.push({
        id: genId('issue'),
        bookId,
        chapterId: chapter.id,
        type: '角色状态冲突',
        level: 'error',
        description: `「${card.name}」已于状态时间线记录死亡（${ev.description}），但出现在本章正文中。`,
        relatedCardIds: [card.id],
        suggestion: '确认是否为回忆/闪回；若非，请替换角色或修订时间线。',
        status: 'open',
      })
    }
  }
  return found
}

// ===== 设置页：节点连通性测试（确定性 mock：URL 含 example → 失败） =====

export async function testProvider(baseURL: string): Promise<'ok' | 'fail'> {
  await mockDelay(900)
  return /example\./.test(baseURL) ? 'fail' : 'ok'
}
