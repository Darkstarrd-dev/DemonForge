// 种子数据：一本素材书《剑啸九州》+ 一本作品书《北境长歌》，串通 M1–M5 全流程演示
import type {
  Book,
  Chapter,
  EntityCard,
  OutlineNode,
  SimScene,
  SimFragment,
  StateEvent,
  ConsistencyIssue,
  ProviderNode,
  ModuleKey,
  ModuleModelMapping,
  MergeCandidate,
} from '../services/types'

const T0 = '2026-06-01T10:00:00.000Z'

export const seedBooks: Book[] = [
  { id: 'book-ref-1', title: '剑啸九州', type: 'reference', createdAt: T0 },
  { id: 'book-proj-1', title: '北境长歌', type: 'project', createdAt: T0 },
]

export const seedChapters: Chapter[] = [
  // ===== 素材书《剑啸九州》：已清洗章节 =====
  {
    id: 'ch-ref-1',
    bookId: 'book-ref-1',
    index: 1,
    title: '第一章 少年出山',
    content:
      '云溪村的清晨总是从一声鸡鸣开始。\n李慕白背着那柄裹布的旧剑站在村口，身后是住了十六年的茅屋。\n"出了这道山门，就没有回头路了。"老人把一块温热的玉佩塞进他手心，"到了凌虚剑派，少说话，多看人。"\n少年点头，转身踏入晨雾。',
    status: 'cleaned',
    updatedAt: T0,
  },
  {
    id: 'ch-ref-2',
    bookId: 'book-ref-1',
    index: 2,
    title: '第二章 凌虚试剑',
    content:
      '凌虚剑派的试剑台立在千仞绝壁之上。\n李慕白的剑出鞘只有半寸，监考的长老却变了脸色。\n"云溪剑意？"长老压低声音，"你师父是谁？"\n"家师无名。"\n台下的窃笑声里，只有一个白衣女子没有笑。她叫苏映雪，掌门的关门弟子。',
    status: 'cleaned',
    updatedAt: T0,
  },
  {
    id: 'ch-ref-3',
    bookId: 'book-ref-1',
    index: 3,
    title: '第三章 藏剑阁夜话',
    content:
      '入门第七日，李慕白被罚去藏剑阁抄录剑谱。\n守阁的瞎眼老仆听他抄到第三卷时突然开口："你抄错了一个字，但错得比原文好。"\n那一夜，老仆教了他一式无名剑法。\n"此剑无名，因为用它的人都死了。"老仆笑了笑，"你若不怕，它就归你。"',
    status: 'cleaned',
    updatedAt: T0,
  },
  {
    id: 'ch-ref-4',
    bookId: 'book-ref-1',
    index: 4,
    title: '第四章 魔教夜袭',
    content:
      '警钟在子时炸响。\n玄阴教的黑衣人如潮水般翻过山门，火光映红了半边夜空。\n李慕白提剑冲出时，正看见苏映雪被三名黑衣人围在廊下。\n他的剑第一次真正出鞘。\n剑光如雪，落地的却是血。',
    status: 'cleaned',
    updatedAt: T0,
  },
  {
    id: 'ch-ref-5',
    bookId: 'book-ref-1',
    index: 5,
    title: '第五章 下山',
    content:
      '夜袭之后，掌门召见了李慕白。\n"藏剑阁的剑谱少了一册，"掌门盯着他，"老仆死前只见过你。"\n百口莫辩的少年被逐出山门，只带走了那柄无名剑。\n下山的路上，苏映雪追了上来："我信你。山下西行三百里有座临安城，去那里等我。"',
    status: 'cleaned',
    updatedAt: T0,
  },
  // ===== 作品书《北境长歌》 =====
  {
    id: 'ch-proj-1',
    bookId: 'book-proj-1',
    index: 1,
    title: '第一章 雪落临渊',
    content:
      '北境的雪下到第七日，临渊城的城墙已经看不出原本的青黑色。\n林照雪站在垛口，望着雪原尽头那条黑线一点点变粗。狼骑来了，比斥候预报的早了两天。\n"传我的令，"她按住腰间的剑，声音很轻，"关城门，放吊桥。"\n副将一愣："放吊桥？"\n"玄霜阁的人今夜会到。"她说，"在那之前，我们得让狼骑以为这座城不设防。"\n雪还在下，城下的黑线已经能分辨出一面面狼头旗。',
    status: 'final',
    outlineNodeId: 'ol-1',
    updatedAt: T0,
  },
  {
    id: 'ch-proj-2',
    bookId: 'book-proj-1',
    index: 2,
    title: '第二章 玄霜来使',
    content:
      '玄霜阁的人到的时候，城头刚换过第二班岗。\n来的是顾长亭，还有他身后十二名白衣剑客。\n"师妹，"他把一只乌木匣子放在案上，"阁主只许我带这些人，和这个。"\n匣中是半卷《寒髓功》的下篇——林照雪修习多年却始终只有上篇的那门内功。\n"代价呢？"她问。玄霜阁从不白给东西。\n"战后，临渊城归玄霜阁节制。"顾长亭垂下眼，"我争过了，没争赢。"\n城外忽然传来号角。陈九从箭楼上滚下来，肩头插着一支狼牙箭："将军，狼骑夜攻——"\n那一夜的雪格外大。陈九替她挡了第二支箭，没能等到天亮。',
    status: 'draft',
    outlineNodeId: 'ol-2',
    updatedAt: T0,
  },
]

export const seedOutline: OutlineNode[] = [
  { id: 'ol-1', bookId: 'book-proj-1', volume: '卷一 孤城', title: '雪落临渊', summary: '狼骑提前兵临临渊城，林照雪示弱诱敌，等待玄霜阁援手。', order: 1 },
  { id: 'ol-2', bookId: 'book-proj-1', volume: '卷一 孤城', title: '玄霜来使', summary: '顾长亭携《寒髓功》下篇抵城，条件是战后临渊归玄霜阁；夜战中陈九战死。', order: 2 },
  { id: 'ol-3', bookId: 'book-proj-1', volume: '卷一 孤城', title: '破围', summary: '林照雪以寒髓功上下篇合修破阵，击退狼骑第一波主力，与萧断河首次照面。', order: 3 },
  { id: 'ol-4', bookId: 'book-proj-1', volume: '卷二 入阁', title: '北上玄霜', summary: '战后林照雪赴玄霜阁谈判临渊城归属，阁内暗流初现。', order: 4 },
  { id: 'ol-5', bookId: 'book-proj-1', volume: '卷二 入阁', title: '阁试', summary: '玄霜阁以三场阁试为名考验林照雪，顾长亭暗中相助。', order: 5 },
  { id: 'ol-6', bookId: 'book-proj-1', volume: '卷二 入阁', title: '断河再临', summary: '萧断河亲赴玄霜阁下战书，身份之谜揭开一角。', order: 6 },
]

export const seedCards: EntityCard[] = [
  // ===== 北境长歌（project） =====
  {
    id: 'card-lzx',
    bookId: 'book-proj-1',
    type: 'character',
    name: '林照雪',
    aliases: ['林将军', '照雪'],
    fields: { 身份: '临渊城守将', 年龄: '二十四', 武功: '寒髓功（上篇）、踏雪剑诀', 阵营: '北境军' },
    description:
      '北境军最年轻的守城将领。父亲战死后接掌临渊城防务。外冷内热，对部下极护短。决策果断，惯于以身犯险。',
    styleNote: '语句短，少用感叹；命令式口吻但对老部下会软半分；紧张时反而语速更慢。',
    styleExamples: ['传我的令，关城门，放吊桥。', '我的兵，一个都不许折在城里。', '你说完了？说完了就去执行。'],
    refs: [
      { chapterId: 'ch-proj-1', excerpt: '林照雪站在垛口，望着雪原尽头那条黑线一点点变粗。' },
      { chapterId: 'ch-proj-2', excerpt: '匣中是半卷《寒髓功》的下篇——林照雪修习多年却始终只有上篇的那门内功。' },
    ],
    updatedAt: T0,
  },
  {
    id: 'card-xdh',
    bookId: 'book-proj-1',
    type: 'character',
    name: '萧断河',
    aliases: ['狼主'],
    fields: { 身份: '狼骑统帅', 年龄: '不详', 武功: '断河刀', 阵营: '北狄' },
    description: '狼骑之主，用兵狠辣却恪守战场规矩。传闻幼年在中原长大，与玄霜阁有旧怨。',
    styleNote: '用词文雅与杀伐内容形成反差；喜欢用反问句；从不自称"本王"，只说"我"。',
    styleExamples: ['雪这么大，何必急着死？', '我给过临渊城三次机会，这是第四次，也是最后一次。'],
    refs: [{ chapterId: 'ch-proj-1', excerpt: '城下的黑线已经能分辨出一面面狼头旗。' }],
    updatedAt: T0,
  },
  {
    id: 'card-gct',
    bookId: 'book-proj-1',
    type: 'character',
    name: '顾长亭',
    aliases: ['顾师兄'],
    fields: { 身份: '玄霜阁首席弟子', 年龄: '二十八', 武功: '寒髓功（全篇）、玄霜剑', 阵营: '玄霜阁' },
    description: '林照雪的同门师兄，玄霜阁首席。温和持重，夹在师门利益与旧谊之间，立场暧昧。',
    styleNote: '措辞克制，常用"或许""未必"留余地；为难时会先沉默再开口。',
    styleExamples: ['我争过了，没争赢。', '师妹，有些话，过了今夜我就不能再说了。'],
    refs: [{ chapterId: 'ch-proj-2', excerpt: '来的是顾长亭，还有他身后十二名白衣剑客。' }],
    updatedAt: T0,
  },
  {
    id: 'card-cj',
    bookId: 'book-proj-1',
    type: 'character',
    name: '陈九',
    aliases: ['老九'],
    fields: { 身份: '临渊城亲兵队长', 年龄: '三十六', 武功: '军中枪法', 阵营: '北境军', 现状: '已战死（第二章）' },
    description: '跟随林家两代人的老兵，林照雪的亲兵队长。第二章狼骑夜攻时为林照雪挡箭战死。',
    styleNote: '粗中有细，称呼林照雪"将军"，急了会冒乡音。',
    styleExamples: ['将军，狼骑夜攻——', '俺这条命是老将军捡回来的，还给他闺女，不亏。'],
    refs: [{ chapterId: 'ch-proj-2', excerpt: '陈九替她挡了第二支箭，没能等到天亮。' }],
    updatedAt: T0,
  },
  {
    id: 'card-loc-byxy',
    bookId: 'book-proj-1',
    type: 'location',
    name: '北境雪原',
    aliases: ['雪原'],
    fields: { 区域: '北境', 气候: '常年风雪，冬季白灾' },
    description: '临渊城以北的辽阔雪原，狼骑的天然跑马场；雪季视野极差，斥候作业困难。',
    refs: [{ chapterId: 'ch-proj-1', excerpt: '望着雪原尽头那条黑线一点点变粗。' }],
    updatedAt: T0,
  },
  {
    id: 'card-loc-lyc',
    bookId: 'book-proj-1',
    type: 'location',
    name: '临渊城',
    aliases: ['孤城'],
    fields: { 区域: '北境门户', 守军: '约八千' },
    description: '北境第一要塞，城墙青黑色，三面环山一面临渊。失临渊则北境门户洞开。',
    refs: [{ chapterId: 'ch-proj-1', excerpt: '临渊城的城墙已经看不出原本的青黑色。' }],
    updatedAt: T0,
  },
  {
    id: 'card-skill-hsg',
    bookId: 'book-proj-1',
    type: 'skill',
    name: '寒髓功',
    aliases: [],
    fields: { 类别: '内功', 来源: '玄霜阁镇阁功法', 特性: '上下篇分修则伤身，合修方能大成' },
    description: '玄霜阁镇阁内功。林照雪早年只得上篇，强行修炼留有寒毒隐患；第二章顾长亭携下篇入城。',
    refs: [{ chapterId: 'ch-proj-2', excerpt: '匣中是半卷《寒髓功》的下篇。' }],
    updatedAt: T0,
  },
  {
    id: 'card-skill-txjj',
    bookId: 'book-proj-1',
    type: 'skill',
    name: '踏雪剑诀',
    aliases: [],
    fields: { 类别: '剑法', 来源: '林家家传', 特性: '雪地借力，身法与剑法合一' },
    description: '林家家传剑法，讲究借雪势而动，雪越大威力越强。',
    refs: [{ chapterId: 'ch-proj-1', excerpt: '她按住腰间的剑，声音很轻。' }],
    updatedAt: T0,
  },
  {
    id: 'card-fac-xsg',
    bookId: 'book-proj-1',
    type: 'faction',
    name: '玄霜阁',
    aliases: ['阁中'],
    fields: { 性质: '北境第一武林势力', 立场: '名义中立，实则待价而沽' },
    description: '盘踞北境百年的武林巨擘，以寒髓功与玄霜剑阵立足。对朝廷与北狄两面下注。',
    refs: [{ chapterId: 'ch-proj-2', excerpt: '"战后，临渊城归玄霜阁节制。"' }],
    updatedAt: T0,
  },
  // ===== 剑啸九州（reference） =====
  {
    id: 'card-ref-lmb',
    bookId: 'book-ref-1',
    type: 'character',
    name: '李慕白',
    aliases: ['慕白'],
    fields: { 身份: '凌虚剑派外门弟子', 出身: '云溪村' },
    description: '山村少年，身负来历不明的云溪剑意，入凌虚剑派后卷入藏剑阁失窃案被逐出山门。',
    styleNote: '话少，应答常用短句；不辩解，用行动回应。',
    styleExamples: ['家师无名。', '剑在，人在。'],
    refs: [{ chapterId: 'ch-ref-1', excerpt: '李慕白背着那柄裹布的旧剑站在村口。' }],
    updatedAt: T0,
  },
  {
    id: 'card-ref-syx',
    bookId: 'book-ref-1',
    type: 'character',
    name: '苏映雪',
    aliases: ['苏师姐'],
    fields: { 身份: '凌虚剑派掌门关门弟子' },
    description: '凌虚剑派天之骄女，眼光毒辣，是少数看出李慕白剑意来历的人。',
    styleNote: '直接、笃定，不绕弯子。',
    styleExamples: ['我信你。', '剑是死的，人心是活的。'],
    refs: [{ chapterId: 'ch-ref-2', excerpt: '只有一个白衣女子没有笑。她叫苏映雪。' }],
    updatedAt: T0,
  },
  {
    id: 'card-ref-syx2',
    bookId: 'book-ref-1',
    type: 'character',
    name: '映雪',
    aliases: [],
    fields: { 身份: '凌虚弟子（待确认）' },
    description: '第五章追下山的白衣女子，疑似与苏映雪为同一人，待合并裁决。',
    refs: [{ chapterId: 'ch-ref-5', excerpt: '苏映雪追了上来："我信你。"' }],
    updatedAt: T0,
  },
]

export const seedMergeCandidates: MergeCandidate[] = [
  { id: 'merge-1', cardAId: 'card-ref-syx', cardBId: 'card-ref-syx2', similarity: 0.91, status: 'pending' },
]

export const seedScenes: SimScene[] = [
  {
    id: 'scene-1',
    bookId: 'book-proj-1',
    desc: '第二章夜战之后的城头。雪势渐小，残箭未拔。林照雪守在陈九的尸身旁，顾长亭提灯走上城头。',
    goal: '推演两人在陈九之死后的第一次对话，确立林照雪接受寒髓功下篇但拒绝交城的立场。',
    prevSummary: '狼骑夜攻被击退；陈九为林照雪挡箭战死；玄霜阁开出"战后临渊归阁"的条件。',
    presentCharacterIds: ['card-lzx', 'card-gct'],
    createdAt: T0,
  },
]

export const seedFragments: SimFragment[] = [
  {
    id: 'frag-1',
    sceneId: 'scene-1',
    characterId: 'card-lzx',
    candidates: [
      {
        id: 'frag-1-c1',
        text: '林照雪没有回头。她把陈九的枪放平，用自己的披风盖住老兵的脸。\n"灯拿远些，"她说，"他睡觉怕亮。"\n顾长亭的脚步停在三步外。\n良久，她才开口，声音平得像结了冰的河面："功法我收下。城，不给。"',
      },
      {
        id: 'frag-1-c2',
        text: '"师兄是来收账的？"林照雪背对着灯光，手按在垛口的积雪里，按出五道指痕。\n"阁里的条件我记得很清楚。"她转过身，眼眶是红的，语气却没有一丝波动，"但临渊城八千人的命，不在那只匣子里。"',
      },
    ],
    adoptedText:
      '林照雪没有回头。她把陈九的枪放平，用自己的披风盖住老兵的脸。\n"灯拿远些，"她说，"他睡觉怕亮。"\n顾长亭的脚步停在三步外。\n良久，她才开口，声音平得像结了冰的河面："功法我收下。城，不给。"',
    order: 1,
    createdAt: T0,
  },
]

export const seedStateEvents: StateEvent[] = [
  { id: 'se-1', bookId: 'book-proj-1', chapterId: 'ch-proj-1', entityId: 'card-lzx', eventType: 'location', description: '林照雪坐镇临渊城，登城督防。', createdAt: T0 },
  { id: 'se-2', bookId: 'book-proj-1', chapterId: 'ch-proj-2', entityId: 'card-cj', eventType: 'death', description: '陈九于狼骑夜攻中为林照雪挡箭，战死。', createdAt: T0 },
  { id: 'se-3', bookId: 'book-proj-1', chapterId: 'ch-proj-2', entityId: 'card-lzx', eventType: 'possession', description: '林照雪获得《寒髓功》下篇（乌木匣，来自玄霜阁）。', createdAt: T0 },
  { id: 'se-4', bookId: 'book-proj-1', chapterId: 'ch-proj-2', entityId: 'card-lzx', eventType: 'injury', description: '夜战中林照雪左肩中箭，轻伤未愈。', createdAt: T0 },
  { id: 'se-5', bookId: 'book-proj-1', chapterId: 'ch-proj-2', entityId: 'card-gct', eventType: 'location', description: '顾长亭率十二名玄霜阁剑客入驻临渊城。', createdAt: T0 },
  { id: 'se-6', bookId: 'book-proj-1', chapterId: 'ch-proj-2', entityId: 'card-lzx', eventType: 'relationship', description: '林照雪与玄霜阁关系转为"合作但互相戒备"（因交城条件）。', createdAt: T0 },
]

export const seedIssues: ConsistencyIssue[] = [
  {
    id: 'issue-1',
    bookId: 'book-proj-1',
    chapterId: 'ch-proj-2',
    type: '角色状态冲突',
    level: 'error',
    description: '检测到草稿后文出现"陈九应声而出"，但状态时间线记录陈九已于本章前段战死（事件 se-2）。',
    relatedCardIds: ['card-cj'],
    suggestion: '确认该段是否为回忆/误写；若为误写，建议替换为其他亲兵角色。',
    status: 'open',
  },
  {
    id: 'issue-2',
    bookId: 'book-proj-1',
    chapterId: 'ch-proj-2',
    type: '设定冲突',
    level: 'warning',
    description: '本章描述林照雪"运转寒髓功全篇逼出箭毒"，但其当前仅持有上篇，下篇于本章末才送达且尚未修习。',
    relatedCardIds: ['card-lzx', 'card-skill-hsg'],
    suggestion: '改为"强行催动上篇寒髓功，寒毒隐患加重"，与卡片设定一致。',
    status: 'open',
  },
  {
    id: 'issue-3',
    bookId: 'book-proj-1',
    chapterId: 'ch-proj-2',
    type: '时间线矛盾',
    level: 'warning',
    description: '第一章称玄霜阁援手"今夜会到"，本章开头却写"到的时候，城头刚换过第二班岗"（次日）。前后相差约一日。',
    relatedCardIds: ['card-fac-xsg'],
    suggestion: '统一为"次日夜至"，或在第一章改为"明夜会到"。',
    status: 'open',
  },
]

export const seedProviders: ProviderNode[] = [
  {
    id: 'prov-1',
    name: '本地 llama.cpp',
    baseURL: 'http://127.0.0.1:8080/v1',
    apiKey: '',
    model: 'qwen3-32b-q4',
    enabled: true,
    lastTestResult: null,
    maxConcurrency: 2,
    batchSize: 1,
    intervalSec: 1,
  },
  {
    id: 'prov-2',
    name: '云端 API（示例）',
    baseURL: 'https://api.example.com/v1',
    apiKey: 'sk-demo-xxxx',
    model: 'demo-large-v2',
    enabled: true,
    lastTestResult: null,
    maxConcurrency: 2,
    batchSize: 1,
    intervalSec: 0,
  },
]

export const seedModuleMapping: Record<ModuleKey, ModuleModelMapping> = {
  m1Clean: { nodeId: 'prov-2', model: 'demo-large-v2' },
  m2Extract: { nodeId: 'prov-2', model: 'demo-large-v2' },
  m3Simulate: { nodeId: 'prov-2', model: 'demo-large-v2' },
  m4Generate: { nodeId: 'prov-2', model: 'demo-large-v2' },
  m5Check: { nodeId: 'prov-1', model: 'qwen3-32b-q4' },
  embedding: { nodeId: 'prov-1', model: 'bge-m3' },
}
