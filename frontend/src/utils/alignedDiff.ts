// 双栏对齐 diff——M1 文档 §4.2，基于 diff 包（替代原型手写 LCS）
import { diffLines, diffChars } from 'diff'

export type RowType = 'context' | 'del' | 'add' | 'mod'

export interface DiffSide {
  num: number | null
  text: string
}

export interface DiffRow {
  type: RowType
  left: DiffSide | null
  right: DiffSide | null
  /** mod 行的字符级片段（左右各自渲染） */
  leftParts?: { text: string; removed?: boolean }[]
  rightParts?: { text: string; added?: boolean }[]
}

function toLines(value: string): string[] {
  const arr = value.split('\n')
  if (arr.length > 0 && arr[arr.length - 1] === '') arr.pop()
  return arr
}

/** 行级对齐：相邻的删除/新增块逐行配对为"修改"行并做字符级高亮 */
export function alignedDiff(oldText: string, newText: string): DiffRow[] {
  const changes = diffLines(oldText, newText)
  const rows: DiffRow[] = []
  let ln = 1 // 左侧行号
  let rn = 1 // 右侧行号

  let i = 0
  while (i < changes.length) {
    const c = changes[i]
    if (!c.added && !c.removed) {
      for (const line of toLines(c.value)) {
        rows.push({ type: 'context', left: { num: ln++, text: line }, right: { num: rn++, text: line } })
      }
      i += 1
      continue
    }
    if (c.removed && i + 1 < changes.length && changes[i + 1].added) {
      const delLines = toLines(c.value)
      const addLines = toLines(changes[i + 1].value)
      const n = Math.max(delLines.length, addLines.length)
      for (let k = 0; k < n; k++) {
        const l = k < delLines.length ? delLines[k] : null
        const r = k < addLines.length ? addLines[k] : null
        if (l !== null && r !== null) {
          const parts = diffChars(l, r)
          rows.push({
            type: 'mod',
            left: { num: ln++, text: l },
            right: { num: rn++, text: r },
            leftParts: parts.filter((p) => !p.added).map((p) => ({ text: p.value, removed: p.removed })),
            rightParts: parts.filter((p) => !p.removed).map((p) => ({ text: p.value, added: p.added })),
          })
        } else if (l !== null) {
          rows.push({ type: 'del', left: { num: ln++, text: l }, right: null })
        } else if (r !== null) {
          rows.push({ type: 'add', left: null, right: { num: rn++, text: r } })
        }
      }
      i += 2
      continue
    }
    if (c.removed) {
      for (const line of toLines(c.value)) {
        rows.push({ type: 'del', left: { num: ln++, text: line }, right: null })
      }
    } else {
      for (const line of toLines(c.value)) {
        rows.push({ type: 'add', left: null, right: { num: rn++, text: line } })
      }
    }
    i += 1
  }
  return rows
}

export interface DiffStats {
  del: number
  add: number
  mod: number
}

export function diffStats(rows: DiffRow[]): DiffStats {
  return {
    del: rows.filter((r) => r.type === 'del').length,
    add: rows.filter((r) => r.type === 'add').length,
    mod: rows.filter((r) => r.type === 'mod').length,
  }
}

/**
 * 应用行级决策生成最终文本（修复原型缺陷：lineDecisions 必须生效于入库/导出）。
 * 决策键 = diff 行索引。accept（默认）采用清理结果；reject 恢复原文行；edit 用编辑内容。
 */
export function applyLineDecisions(
  rows: DiffRow[],
  decisions: Record<number, { action: 'accept' | 'reject' | 'edit'; content?: string }>,
): string {
  const out: string[] = []
  rows.forEach((row, idx) => {
    const d = decisions[idx]
    switch (row.type) {
      case 'context':
        out.push(row.right!.text)
        break
      case 'mod':
        if (d?.action === 'reject') out.push(row.left!.text)
        else if (d?.action === 'edit') out.push(d.content ?? row.right!.text)
        else out.push(row.right!.text)
        break
      case 'add':
        if (d?.action === 'reject') break // 拒绝新增 → 该行不出现
        out.push(d?.action === 'edit' ? (d.content ?? row.right!.text) : row.right!.text)
        break
      case 'del':
        // 接受删除（默认）→ 不输出；拒绝删除 → 恢复原文行
        if (d?.action === 'reject') out.push(row.left!.text)
        else if (d?.action === 'edit') out.push(d.content ?? row.left!.text)
        break
    }
  })
  return out.join('\n')
}
