// 临时冒烟测试：node --experimental-strip-types 运行，验证核心逻辑
import { DEMO_RAW_TEXT, mockCleanChapter } from '../src/mocks/demoRaw.ts'
import { splitChapters, PRESET_PATTERNS, retentionRate, detectChapterPattern, detectLeadingChapterTitle, DEFAULT_SPLIT_PATTERNS, compilePatterns, normalizeParagraphs, stripChapterMarker, applyTitleTemplate } from '../src/utils/split.ts'
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

// 数字+冒号（含全角/半角）—— 卷 + 编号冒号的混合机制
const maohaoText = '001：开端\n正文一\n002：发展\n正文二\n003: 高潮\n正文三'
const maohaoDetect = detectChapterPattern(maohaoText, PATTERNS)
check('检测「数字+冒号」→ 推荐 maohao', maohaoDetect.patternKey === 'maohao', `实际 ${maohaoDetect.patternKey}`)
check('「数字+冒号」命中 3 处（全角+半角）', maohaoDetect.hitCount === 3, `实际 ${maohaoDetect.hitCount}`)
const maohaoSearch = compilePatterns(PATTERNS).find((p) => p.key === 'maohao')!.regex!
const maohaoSplit = splitChapters(maohaoText, maohaoSearch, true)
check('「数字+冒号」切分：3 章（无序章，首行即标题）', maohaoSplit.length === 3, `实际 ${maohaoSplit.length}：${maohaoSplit.map((c) => c.title).join(' | ')}`)
check('「数字+冒号」标题干净', maohaoSplit[0].title === '001：开端' && maohaoSplit[2].title === '003: 高潮', maohaoSplit.map((c) => c.title).join(' | '))

// 卷 + 数字冒号的混合机制：卷行（第一卷/第二卷）由内置卷正则旁路识别单独成章，
// 各卷下的 001：标题 由 maohao 模式切分
const mixedVolText = [
  '第一卷',
  '001：章节名',
  '正文一',
  '002：章节名',
  '正文二',
  '第二卷',
  '001：章节名',
  '正文三',
  '002：章节名',
  '正文四',
].join('\n')
const mixedVolDetect = detectChapterPattern(mixedVolText, PATTERNS)
check('混合机制（卷+数字冒号）→ 推荐 maohao', mixedVolDetect.patternKey === 'maohao', `实际 ${mixedVolDetect.patternKey}`)
const mixedVolSplit = splitChapters(mixedVolText, maohaoSearch, false)
check('混合机制：卷行单独成章（2 个卷）', mixedVolSplit.filter((c) => c.isVolume).length === 2, mixedVolSplit.map((c) => `${c.title}${c.isVolume ? '(卷)' : ''}`).join(' | '))
check('混合机制：编号标题章 = 4', mixedVolSplit.filter((c) => !c.isVolume).length === 4, mixedVolSplit.map((c) => c.title).join(' | '))

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

// 6. 行内标题查找（emoji 前缀 / 标题粘连正文末尾 / 正文引用护栏）—— 2026-06-19 重构
const zhangSearch = compilePatterns(PATTERNS).find((p) => p.key === 'zhang')!.regex!

// emoji 前缀：👍第2章 ... 应被剥除
const emojiText = '👍第1章 开端\n正文一\n👍第2章 发展\n正文二'
const emojiDetect = detectChapterPattern(emojiText, PATTERNS)
check('检测带 emoji 前缀「第X章」→ 推荐 zhang', emojiDetect.patternKey === 'zhang', `实际 ${emojiDetect.patternKey}`)
check('emoji 前缀命中 2 处', emojiDetect.hitCount === 2, `实际 ${emojiDetect.hitCount}`)
const emojiSplit = splitChapters(emojiText, zhangSearch, true)
check('emoji 剥除，标题干净（第1章 开端）', emojiSplit[0].title === '第1章 开端' && !emojiSplit[0].title.includes('👍'), emojiSplit[0].title)

// 标题粘连在正文末尾同一行（句末标点后）
const stickText = '前文一句话。第3章 接受现实\n正文一\n后面一句。第4章 新的篇章\n正文二'
const stickDetect = detectChapterPattern(stickText, PATTERNS)
check('检测粘连标题（句末标点后）→ 推荐 zhang', stickDetect.patternKey === 'zhang', `实际 ${stickDetect.patternKey}`)
check('粘连标题命中 2 处', stickDetect.hitCount === 2, `实际 ${stickDetect.hitCount}`)
const stickSplit = splitChapters(stickText, zhangSearch, true)
check('粘连标题切分：3 章（序章 + 2 标题章）', stickSplit.length === 3, `实际 ${stickSplit.length}：${stickSplit.map((c) => c.title).join(' | ')}`)
check('标题前正文归入序章', stickSplit[0].content.includes('前文一句话。'), stickSplit[0].content)
check('第3章标题干净', stickSplit[1].title === '第3章 接受现实', stickSplit[1].title)
check('第3章含其后的粘连正文（后面一句。）', stickSplit[1].content.includes('后面一句。'), stickSplit[1].content)

// 正文引用护栏：「他翻到第三章」前一字符「到」非句末标点 → 不误切
const refText = '他翻到第三章看了看，觉得无聊。\n第一章 开端\n正文一\n第二章 发展\n正文二'
const refDetect = detectChapterPattern(refText, PATTERNS)
check('正文引用不误切：仍推荐 zhang', refDetect.patternKey === 'zhang', `实际 ${refDetect.patternKey}`)
check('正文引用被护栏拦下：仅 2 处真实命中', refDetect.hitCount === 2, `实际 ${refDetect.hitCount}`)
const refSplit = splitChapters(refText, zhangSearch, true)
check('正文引用不产生额外切分：3 章（序章 + 2）', refSplit.length === 3, `实际 ${refSplit.length}：${refSplit.map((c) => c.title).join(' | ')}`)
check('正文引用保留在序章', refSplit[0].content.includes('他翻到第三章'), refSplit[0].content)

// 7. 中文闭引号收尾的标题粘连（对话 ～" 紧跟下一章标题）
const quoteText = '　　"那么，让我稍稍修改下指令，再挑选几位幸运观众～"第2章 名为日常的崩坏\n正文一\n　　"说罢。第3章 新的展开\n正文二'
const quoteDetect = detectChapterPattern(quoteText, PATTERNS)
check('闭引号收尾标题粘连 → 推荐 zhang', quoteDetect.patternKey === 'zhang', `实际 ${quoteDetect.patternKey}`)
check('闭引号收尾标题命中 2 处', quoteDetect.hitCount === 2, `实际 ${quoteDetect.hitCount}`)
const quoteSplit = splitChapters(quoteText, zhangSearch, true)
check('闭引号收尾切分：3 章（序章 + 2 标题章）', quoteSplit.length === 3, `实际 ${quoteSplit.length}：${quoteSplit.map((c) => c.title).join(' | ')}`)
check('第2章标题干净', quoteSplit[1].title === '第2章 名为日常的崩坏', quoteSplit[1].title)
check('标题前对话归入序章', quoteSplit[0].content.includes('幸运观众'), quoteSplit[0].content)
check('第2章含其后正文', quoteSplit[1].content.includes('正文一'), quoteSplit[1].content)

// 8. 段落格式化（切分时即格式化）
check('无空行 → 段间补空行', normalizeParagraphs('第一段。\n第二段。\n第三段。') === '第一段。\n\n第二段。\n\n第三段。', normalizeParagraphs('第一段。\n第二段。\n第三段。'))
check('多空行 → 压成 1 个', normalizeParagraphs('第一段。\n\n\n\n第二段。') === '第一段。\n\n第二段。', normalizeParagraphs('第一段。\n\n\n\n第二段。'))
check('已有单空行 → 不动', normalizeParagraphs('第一段。\n\n第二段。') === '第一段。\n\n第二段。', normalizeParagraphs('第一段。\n\n第二段。'))

// 9. 人工拆分后自动检测拆分位置后的章节标题（detectLeadingChapterTitle）
// 场景：用户光标拆在「正文…第3章 新的展开\n正文」的「第3章」前 → 拆分后内容以标题行开头
const detectedHit = detectLeadingChapterTitle('第3章 新的展开\n　　正文一\n　　正文二', PATTERNS)
check('拆分后内容以「第N章」开头 → 自动检测到标题', !!detectedHit && detectedHit.title === '第3章 新的展开', detectedHit?.title ?? 'null')
check('检测到标题 → content 剥离首行标题', !!detectedHit && detectedHit.content.includes('正文一') && !detectedHit.content.includes('第3章'), detectedHit?.content ?? 'null')
// 场景：拆分后内容是普通正文（无标题特征）→ 返回 null（调用方回退到「原标题（续）」）
const noHit = detectLeadingChapterTitle('　　他翻到书页，继续阅读。\n　　第二段。', PATTERNS)
check('拆分后内容无标题特征 → 返回 null', noHit === null, JSON.stringify(noHit))
// 场景：首行带装饰前缀（★第4章 暗流）→ stripDecor 后仍能检测
const decorHit = detectLeadingChapterTitle('★第4章 暗流\n正文', PATTERNS)
check('首行带装饰前缀 → stripDecor 后检测到标题', !!decorHit && decorHit.title === '第4章 暗流', decorHit?.title ?? 'null')
// 场景：空内容 → null
check('空内容 → null', detectLeadingChapterTitle('', PATTERNS) === null)

// ── 10. 章节名称替换：stripChapterMarker ──
check('第3章 接受现实 → 接受现实', stripChapterMarker('第3章 接受现实') === '接受现实')
check('001：开端 → 开端', stripChapterMarker('001：开端') === '开端')
check('3、旧案重提 → 旧案重提', stripChapterMarker('3、旧案重提') === '旧案重提')
check('第一卷 夜起（卷标记也被剥离）→ 夜起', stripChapterMarker('第一卷 夜起') === '夜起', stripChapterMarker('第一卷 夜起'))
check('无章号标题 → 原样', stripChapterMarker('普通序言') === '普通序言')
check('空标题 → 原样', stripChapterMarker('') === '')

// ── 11. 章节名称替换：applyTitleTemplate ──
const renSrc = [
  { title: '第1章 开端' },
  { title: '第2章 发展' },
  { title: '第一卷 夜起', isVolume: true },
  { title: '第3章 转折' },
]

const ren1 = applyTitleTemplate(renSrc, '第{0n}章 {title}')
check('模板 第{0n}章 {title}：序章 → 第01章 开端', ren1[0].title === '第01章 开端', ren1[0].title)
check('模板 第{0n}章 {title}：发展 → 第02章 发展', ren1[1].title === '第02章 发展', ren1[1].title)
check('模板 第{0n}章 {title}：卷章跳过（原样）', ren1[2].title === '第一卷 夜起', ren1[2].title)
check('模板 第{0n}章 {title}：转折 → 第03章 转折', ren1[3].title === '第03章 转折', ren1[3].title)

const ren2 = applyTitleTemplate(renSrc, '{n}')
check('模板 {n}：序号递增', ren2[0].title === '1' && ren2[1].title === '2' && ren2[3].title === '3')

const ren3 = applyTitleTemplate(renSrc, '{raw}')
check('模板 {raw}：原样（幂等）', ren3[0].title === '第1章 开端' && ren3[1].title === '第2章 发展' && ren3[3].title === '第3章 转折')

const ren4 = applyTitleTemplate(renSrc, '第{0n}章 {title}', { start: 10 })
check('start=10：从 10 开始编号', ren4[0].title === '第10章 开端' && ren4[1].title === '第11章 发展' && ren4[3].title === '第12章 转折')

const ren5 = applyTitleTemplate(renSrc, '第{0n}章 {title}', { skipVolume: false })
check('skipVolume=false：卷章也替换', ren5[2].title !== '第一卷 夜起', ren5[2].title)

const ren6 = applyTitleTemplate(renSrc, '')
check('空模板：全部原样（不替换）', ren6[0].title === '第1章 开端' && ren6[1].title === '第2章 发展')

// 补零：大量章节自动推断位数
const manyChapters = Array.from({ length: 120 }, (_, i) => ({ title: `第${i + 1}章 序号` }))
const ren7 = applyTitleTemplate(manyChapters, '第{0n}章 {title}')
check('120 章补零为 3 位：第001章', ren7[0].title === '第001章 序号', ren7[0].title)
check('120 章补零为 3 位：第120章', ren7[119].title === '第120章 序号', ren7[119].title)

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
