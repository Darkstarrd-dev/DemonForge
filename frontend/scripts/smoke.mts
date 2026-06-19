// 临时冒烟测试：node --experimental-strip-types 运行，验证核心逻辑
import { DEMO_RAW_TEXT, mockCleanChapter } from '../src/mocks/demoRaw.ts'
import { splitChapters, PRESET_PATTERNS, retentionRate, detectChapterPattern, DEFAULT_SPLIT_PATTERNS, compilePatterns } from '../src/utils/split.ts'
import { alignedDiff, applyLineDecisions, diffStats } from '../src/utils/alignedDiff.ts'

let failed = 0
function check(name: string, cond: boolean, detail?: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failed++
}

// 1. 切分：第X章模式
const zhang = PRESET_PATTERNS.find((p) => p.key === 'zhang')!.regex!
const chapters = splitChapters(DEMO_RAW_TEXT, zhang, true)
check('切分产出 9 章（序章 + 2 卷标记 + 6 个第X章标题）', chapters.length === 9, `实际 ${chapters.length}：${chapters.map((c) => c.title).join(' | ')}`)
check('序章保留', chapters[0].title === '序章')
check('「3、旧案重提」未匹配并入上一章（留给 AI 重拆演示）', chapters.some((c) => c.content.includes('3、旧案重提')))
check('卷行单独成章且标记 isVolume', chapters.some((c) => c.isVolume && c.title.startsWith('第一卷')), '应有第一卷卷章')

// 2. 不保留序章：开头并入第一章
const noProl = splitChapters(DEMO_RAW_TEXT, zhang, false)
check('不保留序章时为 8 章', noProl.length === 8, `实际 ${noProl.length}`)
check('开头内容并入第一章（首卷章）', noProl[0].content.includes('玄夜录'))

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

// 5. 自动检测章节模式
const PATTERNS = DEFAULT_SPLIT_PATTERNS

const zhangText = '第一章 雨夜\n正文一\n第二章 风雪\n正文二\n第三章 旧案\n正文三'
const zhangDetect = detectChapterPattern(zhangText, PATTERNS)
check('检测「第X章」→ 推荐 zhang', zhangDetect.patternKey === 'zhang', `实际 ${zhangDetect.patternKey}`)
check('检测「第X章」命中 3 处', zhangDetect.hitCount === 3, `实际 ${zhangDetect.hitCount}`)

// 装饰符号前缀剥除
const decorText = '[爱心]第一章 开端\n正文一\n[★]第二章 发展\n正文二'
const decorDetect = detectChapterPattern(decorText, PATTERNS)
check('检测带前缀「第X章」→ 推荐 zhang', decorDetect.patternKey === 'zhang', `实际 ${decorDetect.patternKey}`)
const decorSplit = splitChapters(decorText, compilePatterns(PATTERNS).find((p) => p.key === 'zhang')!.regex!, true)
check('前缀被剥除，标题无 [爱心]', !decorSplit[0].title.includes('爱心') && decorSplit[0].title.startsWith('第一章'), decorSplit[0].title)

// Chapter N（英文）
const chapterText = 'Chapter 1 Begin\nbody one\nChapter 2 Goes\nbody two'
const chapterDetect = detectChapterPattern(chapterText, PATTERNS)
check('检测「Chapter N」→ 推荐 chapter', chapterDetect.patternKey === 'chapter', `实际 ${chapterDetect.patternKey}`)

// 数字+顿号
const dunhaoText = '1、开端\n正文一\n2、发展\n正文二\n3、高潮\n正文三'
const dunhaoDetect = detectChapterPattern(dunhaoText, PATTERNS)
check('检测「数字+顿号」→ 推荐 dunhao', dunhaoDetect.patternKey === 'dunhao', `实际 ${dunhaoDetect.patternKey}`)

// 无章节标题
const plainText = '这是一段没有任何章节标题的普通文本，只有正文内容。\n第二行也是正文。'
const plainDetect = detectChapterPattern(plainText, PATTERNS)
check('无章节模式 → 返回 custom', plainDetect.patternKey === 'custom' && plainDetect.confidence === 0, `${plainDetect.patternKey}/${plainDetect.confidence}`)

// 卷单独成章 + skipClean
const volText = '第一卷 夜起\n第一章 雨夜来客\n正文一\n第二卷 京华\n第二章 入京\n正文二'
const volRegex = compilePatterns(PATTERNS).find((p) => p.key === 'zhang')!.regex!
const volSplit = splitChapters(volText, volRegex, false)
check('卷结构：卷行单独成章', volSplit.some((c) => c.isVolume && c.title.startsWith('第一卷')), volSplit.map((c) => `${c.title}${c.isVolume ? '(卷)' : ''}`).join(' | '))
check('卷结构：卷章内容不并入下一章正文', volSplit.filter((c) => c.isVolume).every((c) => !c.content.includes('正文')), '卷章不应含正文')

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
