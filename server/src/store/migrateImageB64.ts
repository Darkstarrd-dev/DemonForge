// 一次性迁移：清除数据库里既有的 b64 图片数据（图片已改为落盘归档，不再存 DB）。
// 用户已确认「直接清除」策略：删除 chat_sessions 里 content 为 data:image 的图片消息、
// 删除 test_history 里 imageResponse 为 b64 的图库条目。用 settings.imageB64Purged 守卫，仅执行一次。
import { getDb } from './db'
import { readSettings, updateSettings } from '../routes/settings'

export function migrateImageB64Purge(): void {
  if (readSettings().imageB64Purged === true) return

  const db = getDb()
  let purgedMsgs = 0
  let purgedRows = 0

  const tx = db.transaction(() => {
    // 1) chat_sessions：剔除每个会话里 content 以 data:image 开头的图片消息（保留文本消息）
    const sessRows = db.prepare('SELECT id, data FROM chat_sessions').all() as { id: string; data: string }[]
    const updateSess = db.prepare('UPDATE chat_sessions SET data = ? WHERE id = ?')
    for (const row of sessRows) {
      let session: { messages?: Array<{ content?: string }> }
      try { session = JSON.parse(row.data) } catch { continue }
      if (!Array.isArray(session.messages)) continue
      const before = session.messages.length
      session.messages = session.messages.filter(
        (m) => !(typeof m.content === 'string' && m.content.startsWith('data:image')),
      )
      const removed = before - session.messages.length
      if (removed > 0) {
        purgedMsgs += removed
        updateSess.run(JSON.stringify(session), row.id)
      }
    }

    // 2) test_history（图库）：imageResponse 为 b64 dataUrl 的条目整条删除
    const histRows = db.prepare('SELECT id, data FROM test_history').all() as { id: string; data: string }[]
    const delHist = db.prepare('DELETE FROM test_history WHERE id = ?')
    for (const row of histRows) {
      let item: { imageResponse?: string }
      try { item = JSON.parse(row.data) } catch { continue }
      if (typeof item.imageResponse === 'string' && item.imageResponse.startsWith('data:image')) {
        delHist.run(row.id)
        purgedRows++
      }
    }
  })

  try {
    tx()
    updateSettings({ imageB64Purged: true })
    if (purgedMsgs || purgedRows) {
      console.log(`[migrate] 已清除 DB 内 b64 图片：会话图片消息 ${purgedMsgs} 条 / 图库条目 ${purgedRows} 条`)
    } else {
      console.log('[migrate] 无 b64 图片记录需清除')
    }
  } catch (err) {
    // 迁移失败不阻断启动；下次启动仍会重试（守卫未写入）
    console.warn(`[migrate] b64 清除失败（下次启动将重试）：${String(err)}`)
  }
}
