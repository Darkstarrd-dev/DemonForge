import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import { DEFAULT_SPLIT_PATTERNS } from '../../utils/split'
import { pushSettingsNow } from '../persistence'

/** M1 导入域：清理系统提示词 / 导入会话 / 章节检测模式池 / 节点覆盖 / 自动重试 / 标题模板 /
 * 测试文本 / 清理运行态。 */
export type M1ImportSlice = Pick<
  AppState,
  | 'm1SystemPrompt' | 'importSession' | 'splitPatterns' | 'cleanNodeOverrides'
  | 'm1AutoRetry' | 'm1TitleTemplate' | 'm1TestText' | 'cleanRun'
  | 'setCleanRun' | 'setSplitPatterns' | 'resetSplitPatterns'
>

export const createM1ImportSlice: StateCreator<AppState, [], [], M1ImportSlice> = (set) => ({
  m1SystemPrompt: '',
  importSession: null,
  splitPatterns: DEFAULT_SPLIT_PATTERNS.map((p) => ({ ...p })),
  cleanNodeOverrides: {} as AppState['cleanNodeOverrides'],
  m1AutoRetry: true,
  m1TitleTemplate: '第{0n}章 {title}',
  m1TestText: `[爱心]第1章

　　中少女穿着巫女服，深棕色的长发，编成发辫垂在胸前，额头上沁出细密的汗珠。
　　转她正在教夏川神乐舞。
　　宭这是祭典前的完整排练，下周就要正式演出了。
　　伞"这个转身要流畅...夏川君看好了。"
　　柒三叶示范了一个旋转动作，巫女服的下摆扬起。
　　易她转得很稳，脚步轻盈得像在飘。
　　7夏川跟着做，但他的动作更...利落。
　　2少了些柔美，多了种说不出的神圣与力量感。
　　韭"不对不对..."
　　幺三叶走到他身后，犹豫了一下，然后红着脸伸手扶住他的腰，"腰要这样转..."
　　壹她的手很小，很软，隔着薄薄的衣物能感觉到温度。
　　韭夏川能闻到她身上淡淡的香味，不是香水，是皂角混合着少女体香的味道。


　　"啊...是、是的..."
　　三叶慌忙退开10016，心跳如71055小鹿乱撞一样不受控制。
　　她低下头，手指绞着衣角，耳根红得滴血。

　　那是四宫家最隐秘的武装力量，平时根本不会动用，只有在家族存亡关头才会出现。
　　"早坂。"
　　辉夜突小説羣3七然转身1七29，"你觉得，发生11九了什么？"
　　早坂爱沉吟片刻:"从情报看，不只是四宫家，其他几家财阀也有类似动作。"

　　"但在家族利益上...各凭本事。"
　　阳乃站微笑着起身，"中转峮公  3气1漆平竞（二）9吆伊9争，那就...合作愉快？"
　　"合作愉快。"

　　ps：正在悬赏中，也是月末最后一天了，系统送的月票和刀片如果有的话不送就过期了~求~
　　ps：悬赏结束，向上取整，月票欠四章，推荐票欠两章，打赏欠一章，刀片欠两章，……总计正好欠十章。
　　0求鲜花

欢迎加入『灵珑小说群』
分享废卢，刺猬猫等全网小说资源，每个群的文件不一样（之前的群没了，以下是新群）
（灵珑小说外群一群：852104278）
（灵珑小说外群二群：817040545）
（中转群371729119）
（ 备用2群893964460）
以上群号搜不到可以加qq264235286`,
  cleanRun: null,

  setCleanRun: (patch) =>
    set((s) => ({
      cleanRun: patch === null ? null : { ...(s.cleanRun ?? { handle: null, running: false, paused: false, active: [], nodeSessions: [], startedAt: 0 }), ...patch },
    })),
  // ===== 章节检测模式池（设置通道，落 settings.json） =====
  setSplitPatterns: (patterns) => {
    set({ splitPatterns: patterns })
    pushSettingsNow()
  },
  resetSplitPatterns: () => {
    set({ splitPatterns: DEFAULT_SPLIT_PATTERNS.map((p) => ({ ...p })) })
    pushSettingsNow()
  },
})
