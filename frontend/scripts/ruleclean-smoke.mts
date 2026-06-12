// 规则清理引擎冒烟测试：对真实 raw 样本断言清理效果与不误删红线
// 运行：node --experimental-strip-types scripts/ruleclean-smoke.mts
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ruleClean, INVISIBLE_RE } from '../src/utils/ruleClean.ts'

let failed = 0
function check(name: string, cond: boolean, detail?: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failed++
}

const here = dirname(fileURLToPath(import.meta.url))
const raw = readFileSync(join(here, '..', '..', 'docs', 'M1_raw_features - raw.md'), 'utf8')
const res = ruleClean(raw, { minCorpusHits: 1 })
const c = res.cleaned

// 1. 自锚定载荷提取
for (const p of ['852104278', '817040545', '371729119', '893964460', '264235286']) {
  check(`载荷提取 ${p}`, res.payloads.includes(p), res.payloads.join(','))
}

// 2. 数字碎片直插清除
check('明3717天→明天', c.includes('“明天开始，晚饭后练习一小时。”') && !c.includes('3717'))
check('行尾 29119 清除', !c.includes('29119'))
check('毛[小説羣89]利兰→毛利兰', c.includes('毛利兰都出现了'))
check('39644/60 清除', c.includes('还有什么动漫女主会出现'))
check('893/964/460+灵珑中转清除（残留“群辆”属已知局限）', !c.includes('893') && !c.includes('964') && !c.includes('灵珑中转') && c.includes('装甲车旁。'))
check('优美[小説羣817]子040…545→优美子', c.includes('优美子看着她。'))
check('辉夜突[小説羣3七]然转身[1七29]', c.includes('辉夜突然转身，“你觉得，发生了什么？”'))
check('会[仦裞羣3七]的[1七29。”11九]→会的', c.includes('“会的。”'))
check('备用宭…８93jiu做6四四陆0→请去做法事', c.includes('被町内的人请去做法事了'))
check('中转峮公3气1漆平竞（二）9吆伊9争→公平竞争', c.includes('公平竞争'))
check('水裙8521果→水果', c.includes('看到了那些水果'))
check('从04278她房间→从她房间', c.includes('从她房间里走出来'))
check('八五二…一零四…二七八（全弱谐音碎片）', c.includes('夏川也拿了一串。'))
check('小说群37（一）７贰酒吆壹究→以迅雷不及掩耳', c.includes('以迅雷不及掩耳之势'))
check('眼七二九一一九睛→眼睛', c.includes('瞪大眼睛'))
check('标题内 64460 清除且章节号保留', c.includes('第589三92章') && c.includes('靠着那棵树唬人'))

// 3. 行首藏号（竖排）
check('竖排剥离：中少女→少女', c.includes('　　少女穿着巫女服'))
check('竖排剥离：转她→她', c.includes('　　她正在教夏川神乐舞。'))
check('竖排剥离：伞“这个转身', c.includes('　　“这个转身要流畅...夏川君看好了。”'))
check('竖排剥离：宭这是→这是', c.includes('　　这是祭典前的完整排练'))

// 4. 块级广告 / HTML / 零宽符 / 水印
check('广告块整体删除', !c.includes('欢迎加入') && !c.includes('ctfile') && !c.includes('访问密码'))
check('盗版声明删除', !c.includes('本作品来自互联网'))
check('备用群行删除（谐音写法）', !c.includes('吧玖三九') && !c.includes('liu邻'))
check('纯杂讯行删除', !c.includes('8117'))
check('<img> 标签删除', !c.includes('<img'))
check('零宽符剥离', !new RegExp(INVISIBLE_RE.source).test(c))
check('平台水印删除、上下文保留', !c.includes('看暴爽小说') && c.includes('厌恶而屏蔽掉。'))

// 5. 不误删（保留红线）
check('人名「三叶」保留', c.includes('三叶，你要好好教他'))
check('真实数字「一千八百万次」保留', c.includes('一千八百万次'))
check('真实数字「明天8k」保留', c.includes('明天8k不计入悬赏'))
check('半角省略号保留', c.includes('“那个神乐舞...我会好好教的。”'))
check('mojibake 段原样保留', c.includes('拔桤灸鹊妥磐罚') && c.includes('拔桤灸任兆'))
check('作者 ps/求票保留', c.includes('ps：正在悬赏中') && c.includes('求鲜花'))
check('请假条保留', c.includes('请假一天'))
check('纯数字/中文数字标题行保留', /^001$/m.test(c) && /^第一章 $/m.test(c))

// 6. 低置信只标记不删
check('未知数字串 10016 未删', c.includes('10016'))
check('未知数字串进 suspects', res.suspects.some((s) => s.excerpt.includes('10016')))
check('密集符号杂讯行被标记', res.suspects.some((s) => s.reason === 'symbol-noise'))

console.log(`\n载荷：${res.payloads.join(' ')}`)
console.log(`删除 ${res.deletions.length} 处，标记 ${res.suspects.length} 处`)
console.log(failed === 0 ? '全部通过' : `${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
