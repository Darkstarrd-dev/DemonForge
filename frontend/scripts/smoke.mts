// 临时冒烟测试：node --experimental-strip-types 运行，验证核心逻辑
import { DEMO_RAW_TEXT, mockCleanChapter } from '../src/mocks/demoRaw.ts'
import { splitChapters, PRESET_PATTERNS, retentionRate } from '../src/utils/split.ts'
import { alignedDiff, applyLineDecisions, diffStats } from '../src/utils/alignedDiff.ts'

let failed = 0
function check(name: string, cond: boolean, detail?: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failed++
}

// 1. 切分：第X章模式
const zhang = PRESET_PATTERNS.find((p) => p.key === 'zhang')!.regex!
const chapters = splitChapters(DEMO_RAW_TEXT, zhang, true)
check('切分产出 7 章（序章 + 6 个第X章标题）', chapters.length === 7, `实际 ${chapters.length}：${chapters.map((c) => c.title).join(' | ')}`)
check('序章保留', chapters[0].title === '序章')
check('「3、旧案重提」未匹配并入上一章（留给 AI 重拆演示）', chapters.some((c) => c.content.includes('3、旧案重提')))

// 2. 不保留序章：开头并入第一章
const noProl = splitChapters(DEMO_RAW_TEXT, zhang, false)
check('不保留序章时为 6 章', noProl.length === 6, `实际 ${noProl.length}`)
check('开头内容并入第一章', noProl[0].content.includes('玄夜录'))

// 3. mock 清理
const ch2 = chapters.find((c) => c.title.startsWith('第二章'))!
const cleaned = mockCleanChapter(ch2.content)
check('广告行（公众号）被删', !cleaned.includes('公众号'))
const ch4 = chapters.find((c) => c.title.startsWith('第四章'))!
const cleaned4 = mockCleanChapter(ch4.content)
check('穿插乱码「终o8于」被修复', cleaned4.includes('终于') && !cleaned4.includes('o8'))
check('正文保留', cleaned4.includes('洛青鸾的瞳孔骤然收缩'))
check('保留率计算', retentionRate(ch4.content, cleaned4) > 0.8 && retentionRate(ch4.content, cleaned4) <= 1)

// 4. 对齐 diff + 行级决策
const orig = '甲行\n广告行 www.test.com\n乙行有错字\n丙行'
const clean = '甲行\n乙行已修正\n丙行'
const rows = alignedDiff(orig, clean)
const stats = diffStats(rows)
check('diff 识别出删除与修改', stats.del + stats.mod >= 2, JSON.stringify(stats))

// 默认（全接受）：结果 = 清理后文本
check('默认决策 = 清理结果', applyLineDecisions(rows, {}) === clean)

// 拒绝所有差异行 → 应恢复原文
const allReject: Record<number, { action: 'reject' }> = {}
rows.forEach((r, i) => {
  if (r.type !== 'context') allReject[i] = { action: 'reject' }
})
check('全部拒绝 = 恢复原文', applyLineDecisions(rows, allReject) === orig, JSON.stringify(applyLineDecisions(rows, allReject)))

// 行内编辑
const editIdx = rows.findIndex((r) => r.type === 'mod' || r.type === 'add')
const edited = applyLineDecisions(rows, { [editIdx]: { action: 'edit', content: '人工改写行' } })
check('行内编辑生效', edited.includes('人工改写行'))

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
