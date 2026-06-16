// 临时单测：解析架构/蓝图文本（阶段 B parse.ts 纯函数）。
// 运行：node --experimental-strip-types scripts/parse-smoke.mts
import { parseArchitecture, parseBlueprint } from '../src/pages/m0-architecture/parse.ts'

let failed = 0
function check(name: string, cond: boolean, detail?: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failed++
}

// ===== parseArchitecture =====
const archText = `## 核心种子
当一个落魄剑客卷入皇权之争，必须在复仇与忠诚间抉择，否则天下大乱。

## 角色动力学
李慕白：表面追求自由，深层渴望认同，灵魂需求是救赎。
苏映雪：表面追求剑道，深层渴望真相。

## 世界观
物理：古代江湖。
社会：朝廷与武林并存。

## 三幕式情节
第一幕：日常打破。
第二幕：灵魂黑夜。
第三幕：终极抉择。`

const arch = parseArchitecture(archText)
check('架构-核心种子含"落魄剑客"', arch.seed.includes('落魄剑客'), JSON.stringify(arch.seed).slice(0, 60))
check('架构-角色动力学含"救赎"', arch.characterDynamics.includes('救赎'))
check('架构-世界观含"朝廷与武林"', arch.worldBuilding.includes('朝廷与武林'))
check('架构-三幕式含"终极抉择"', arch.plotStructure.includes('终极抉择'))
check('架构-分区无串台（种子不含"朝廷"）', !arch.seed.includes('朝廷'))

// 容错：无分区 → 整体塞 seed
const noSection = parseArchitecture('一段没有分区的自由文本')
check('架构-无分区时整体塞 seed', noSection.seed.includes('自由文本') && !noSection.characterDynamics)

// 容错：标题别名（世界构建 → worldBuilding）
const aliasText = `## 种子
种子内容

## 世界构建
世界内容`
const aliasArch = parseArchitecture(aliasText)
check('架构-别名"种子"命中 seed', aliasArch.seed.includes('种子内容'))
check('架构-别名"世界构建"命中 worldBuilding', aliasArch.worldBuilding.includes('世界内容'))

// ===== parseBlueprint =====
const bpText = `第1章 少年出山
定位：主角登场
核心作用：推进主线
悬念密度：渐进
伏笔：埋设身世之谜
认知颠覆：★☆☆☆☆
简述：少年离村入世，初遇江湖险恶。

第2章 凌虚试剑
定位：转折
核心作用：揭示
悬念密度：爆发
伏笔：回收剑意来历
认知颠覆：★★★☆☆
简述：试剑台露出云溪剑意，长老变脸。`

const bp = parseBlueprint(bpText)
check('蓝图-解析出 2 章', bp.length === 2, `实际 ${bp.length}`)
check('蓝图-第1章 order=1', bp[0]?.order === 1)
check('蓝图-第1章 title=少年出山', bp[0]?.title === '少年出山')
check('蓝图-第1章 positioning=主角登场', bp[0]?.positioning === '主角登场')
check('蓝图-第1章 role=推进主线', bp[0]?.role === '推进主线')
check('蓝图-第1章 suspenseDensity=渐进', bp[0]?.suspenseDensity === '渐进')
check('蓝图-第1章 foreshadow=埋设身世之谜', bp[0]?.foreshadow === '埋设身世之谜')
check('蓝图-第1章 twistLevel=1', bp[0]?.twistLevel === 1, String(bp[0]?.twistLevel))
check('蓝图-第1章 summary 含"离村"', bp[0]?.summary.includes('离村'))
check('蓝图-第2章 twistLevel=3', bp[1]?.twistLevel === 3, String(bp[1]?.twistLevel))

// 容错：中文章号 + 标题分隔符变体
const bpVariants = `第十章 - 风云起
定位：高潮
核心作用：转折
悬念密度：爆发
伏笔：揭示真相
认知颠覆：★★★★★
简述：真相大白。`
const bv = parseBlueprint(bpVariants)
check('蓝图-中文章号"十"=10', bv[0]?.order === 10, String(bv[0]?.order))
check('蓝图-标题分隔符变体"- "解析', bv[0]?.title === '风云起')
check('蓝图-五星 twistLevel=5', bv[0]?.twistLevel === 5)

// 空输入
check('蓝图-空文本返回空数组', parseBlueprint('').length === 0)

console.log(`\n${failed === 0 ? '✅ 全部通过' : `❌ ${failed} 项失败`}`)
process.exit(failed === 0 ? 0 : 1)
