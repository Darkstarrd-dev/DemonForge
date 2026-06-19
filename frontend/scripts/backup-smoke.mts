// 临时单测：备份/恢复纯函数（backup.ts 的 buildBundle / parseBundle / migrateBundle / summarizeBusiness）。
// 运行：node --experimental-strip-types scripts/backup-smoke.mts
import {
  buildBundle,
  parseBundle,
  migrateBundle,
  summarizeBusiness,
  BUNDLE_VERSION,
  BUSINESS_KEYS,
} from '../src/utils/backup.ts'

let failed = 0
function check(name: string, cond: boolean, detail?: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!cond) failed++
}

// ===== buildBundle 基础 =====
const sampleSettings = {
  providers: [
    { id: 'p1', name: 'A', nodeType: 'text' as const, baseURL: 'http://x', apiKey: 'sk-secret', model: 'm', enabled: true, maxConcurrency: 2, batchSize: 1, intervalSec: 0 },
  ],
  moduleMapping: { m1Clean: { nodeId: 'p1' } } as Record<string, { nodeId: string | null }>,
  m1SystemPrompt: 'hi',
}
const sampleBusiness = { books: [{ id: 'b1', title: '书名' }], chapters: [{ id: 'c1', bookId: 'b1' }] }

const settingsBundle = buildBundle('settings', sampleSettings, null, false)
check('build-settings-kind', settingsBundle.kind === 'settings' && settingsBundle.version === BUNDLE_VERSION)
check('build-settings-无business', settingsBundle.business === undefined)
check('build-settings-含apiKey', settingsBundle.settings.providers![0].apiKey === 'sk-secret')

const redactedBundle = buildBundle('settings', sampleSettings, null, true)
check('build-settings-脱敏apiKey', redactedBundle.settings.providers![0].apiKey === '')

const fullBundle = buildBundle('full', sampleSettings, sampleBusiness, false)
check('build-full-kind', fullBundle.kind === 'full')
check('build-full-含business', !!fullBundle.business)
check('build-full-books透传', fullBundle.business!.books!.length === 1)
check('build-exportedAt存在', typeof fullBundle.exportedAt === 'string' && fullBundle.exportedAt.length > 0)
check('build-app字段', fullBundle.app === 'novelhelper')

// ===== parseBundle 圆环（build → stringify → parse 一致）=====
const roundtrip = parseBundle(JSON.stringify(settingsBundle))
check('roundtrip-无fatal', roundtrip.fatal === null && !!roundtrip.bundle)
check('roundtrip-kind一致', roundtrip.bundle?.kind === 'settings')
check('roundtrip-无warning', roundtrip.warnings.length === 0)
check('roundtrip-providers保留', roundtrip.bundle?.settings.providers?.length === 1)
check('roundtrip-apiKey保留', roundtrip.bundle?.settings.providers?.[0].apiKey === 'sk-secret')

// ===== 向后兼容：旧版裸 settings.json（无 bundle 包装）=====
const bareSettings = {
  providers: [{ id: 'p1', name: 'A', nodeType: 'text', baseURL: 'http://x', apiKey: 'k', model: 'm', enabled: true }],
  moduleMapping: { m1Clean: { nodeId: 'p1' } },
}
const bareResult = parseBundle(JSON.stringify(bareSettings))
check('裸settings-识别为settings', bareResult.bundle?.kind === 'settings')
check('裸settings-有适配warning', bareResult.warnings.some((w) => w.includes('旧版')))
check('裸settings-providers规范化', bareResult.bundle?.settings.providers?.length === 1)
check('裸settings-moduleMapping合并seed', !!bareResult.bundle?.settings.moduleMapping)
check('裸settings-splitPatterns补默认', !!bareResult.bundle?.settings.splitPatterns && bareResult.bundle.settings.splitPatterns.length > 0)
check('裸settings-custom永在', bareResult.bundle?.settings.splitPatterns?.some((p) => p.key === 'custom'))

// ===== 致命错误：非 JSON =====
const notJson = parseBundle('{这不是json')
check('非JSON-fatal', notJson.fatal !== null && notJson.bundle === null)

// ===== 致命错误：JSON 但是数组 =====
const jsonArray = parseBundle('[1,2,3]')
check('JSON数组-fatal', jsonArray.fatal !== null)

// ===== 容错：providers 坏条目跳过 =====
const withBadProviders = buildBundle('settings', {
  providers: [
    { id: 'good', name: 'G', nodeType: 'text' as const, baseURL: 'u', apiKey: 'k', model: 'm', enabled: true, maxConcurrency: 2, batchSize: 1, intervalSec: 0 },
  ],
}, null, false)
// 手动构造含坏条目的 JSON 再解析
const dirtyJson = JSON.stringify({
  version: 1, app: 'novelhelper', kind: 'settings',
  settings: {
    providers: [
      { id: 'good', name: 'G', nodeType: 'text', baseURL: 'u', apiKey: 'k', model: 'm', enabled: true },
      { id: 123 }, // 缺 name/baseURL/model
      'not-an-object',
      null,
    ],
  },
})
const dirtyResult = parseBundle(dirtyJson)
check('坏条目-保留good', dirtyResult.bundle?.settings.providers?.length === 1)
check('坏条目-有warning', dirtyResult.warnings.length >= 1)
check('坏条目-good的id正确', dirtyResult.bundle?.settings.providers?.[0].id === 'good')

// ===== 容错：未知 app 字段 =====
const unknownApp = parseBundle(JSON.stringify({ version: 1, app: 'other-app', kind: 'settings', settings: {} }))
check('未知app-允许导入', unknownApp.bundle !== null)
check('未知app-有warning', unknownApp.warnings.some((w) => w.includes('other-app')))

// ===== 容错：更高版本 =====
const higherVer = parseBundle(JSON.stringify({ version: 999, app: 'novelhelper', kind: 'settings', settings: {} }))
check('高版本-不崩', higherVer.bundle !== null)
check('高版本-有warning', higherVer.warnings.some((w) => w.includes('高于当前支持')))

// ===== 容错：业务数据多余键被忽略 =====
const extraBizKey = parseBundle(JSON.stringify({
  version: 1, app: 'novelhelper', kind: 'full',
  settings: {},
  business: { books: [{ id: 'b1' }], unknownEntity: [{ x: 1 }] },
}))
check('多余业务键-忽略', !extraBizKey.bundle?.business?.hasOwnProperty('unknownEntity'))
check('多余业务键-保留books', extraBizKey.bundle?.business?.books?.length === 1)

// ===== migrateBundle（预留，当前原样返回）=====
const beforeMig = { ...fullBundle }
const afterMig = migrateBundle(fullBundle)
check('migrate-版本不变', afterMig.version === beforeMig.version)

// ===== summarizeBusiness =====
const summary = summarizeBusiness(sampleBusiness)
check('summary-books=1', summary.books === 1)
check('summary-chapters=1', summary.chapters === 1)
check('summary-全11键', BUSINESS_KEYS.every((k) => typeof summary[k] === 'number'))
check('summary-undefined返回空', Object.keys(summarizeBusiness(undefined)).length === 0)

// ===== 完整备份 roundtrip（settings + business）=====
const fullRoundtrip = parseBundle(JSON.stringify(fullBundle))
check('full-roundtrip-无fatal', fullRoundtrip.fatal === null)
check('full-roundtrip-kind=full', fullRoundtrip.bundle?.kind === 'full')
check('full-roundtrip-business保留', fullRoundtrip.bundle?.business?.books?.length === 1)
check('full-roundtrip-settings保留', fullRoundtrip.bundle?.settings.providers?.length === 1)

console.log(`\n${failed === 0 ? '✅ 全部通过' : `❌ ${failed} 项失败`}`)
if (failed > 0) process.exit(1)
