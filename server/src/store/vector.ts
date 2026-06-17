// RAG 检索层（Node + sqlite-vec）。
// 文本 → 递归分块 → embedding → 写 vec_chunks(向量) + chunk_meta(来源/正文)；
// 查询 → embedding → KNN(vec_distance) → join chunk_meta 返回召回片段。
// 向量虚拟表 vec_chunks 维度由首个 embedding 决定，记入 settings.embeddingDim；
// 换 embedding 模型导致维度变更需重建向量库（addToVectorStore 会报错提示）。
import { embed, type ProviderConfig } from '../llmClient'
import { readSettings, updateSettings } from '../routes/settings'
import { getDb } from './db'

export interface RagChunk {
  source: string
  bookId?: string
  chapterId?: string
  text: string
  distance: number
}

export interface ChunkMeta {
  source: string
  bookId?: string
  chapterId?: string
}

// 分块参数（对齐 ref/novel-generator-skill/scripts/vector_store.py 的 RecursiveCharacterTextSplitter）
const CHUNK_SIZE = 3000
const CHUNK_OVERLAP = 500
const SEPARATORS = ['\n\n', '\n', '。', '！', '？', ' ', '']

/** 按分隔符切分；非空分隔符拼回片段尾部（如句号留句尾），空串按字符切。 */
function splitOn(text: string, sep: string): string[] {
  if (sep === '') return Array.from(text)
  const parts = text.split(sep)
  const out: string[] = []
  for (let i = 0; i < parts.length; i++) {
    out.push(i < parts.length - 1 ? parts[i] + sep : parts[i])
  }
  return out.filter((s) => s !== '')
}

/** 把小片段合并成接近 chunkSize 的块，块间保留 overlap（分隔符已嵌入片段，join 用空串）。 */
function mergeSplits(splits: string[], chunkSize: number, overlap: number): string[] {
  const docs: string[] = []
  let current: string[] = []
  let total = 0
  for (const d of splits) {
    if (total + d.length > chunkSize && current.length) {
      const doc = current.join('').trim()
      if (doc) docs.push(doc)
      while (total > overlap && current.length) {
        total -= current[0].length
        current.shift()
      }
    }
    current.push(d)
    total += d.length
  }
  const doc = current.join('').trim()
  if (doc) docs.push(doc)
  return docs
}

/** RecursiveCharacterTextSplitter 等价实现：递归选用首个适用分隔符，超长块用更细分隔符再切。 */
export function splitText(
  text: string,
  separators: string[] = SEPARATORS,
  chunkSize = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP,
): string[] {
  const finalChunks: string[] = []
  let sep = separators[separators.length - 1]
  let rest: string[] = []
  for (let i = 0; i < separators.length; i++) {
    const s = separators[i]
    if (s === '') { sep = s; rest = []; break }
    if (text.includes(s)) { sep = s; rest = separators.slice(i + 1); break }
  }
  const splits = splitOn(text, sep)
  let good: string[] = []
  for (const s of splits) {
    if (s.length < chunkSize) {
      good.push(s)
    } else {
      if (good.length) { finalChunks.push(...mergeSplits(good, chunkSize, overlap)); good = [] }
      if (!rest.length) finalChunks.push(s)
      else finalChunks.push(...splitText(s, rest, chunkSize, overlap))
    }
  }
  if (good.length) finalChunks.push(...mergeSplits(good, chunkSize, overlap))
  return finalChunks
}

/** 向量序列化为 sqlite-vec 接受的 float32 little-endian BLOB。 */
function toBlob(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer)
}

/** 确保 vec_chunks 虚拟表存在且维度一致；首次建表记录维度，维度变更报错。 */
function ensureVecTable(db: ReturnType<typeof getDb>, dim: number): void {
  const recorded = readSettings().embeddingDim
  if (typeof recorded === 'number' && recorded > 0 && recorded !== dim) {
    throw new Error(`embedding 维度变更（已记录 ${recorded}，当前 ${dim}）——更换 embedding 模型需重建向量库`)
  }
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(embedding float[${dim}])`)
  if (typeof recorded !== 'number' || recorded <= 0) updateSettings({ embeddingDim: dim })
}

/** 入库：每条 text 分块 → 批量 embedding → 写 vec_chunks + chunk_meta。 */
export async function addToVectorStore(opts: {
  texts: string[]
  meta: ChunkMeta
  provider: ProviderConfig
}): Promise<{ added: number; dim: number }> {
  const chunks: string[] = []
  for (const t of opts.texts) {
    if (typeof t === 'string' && t.trim()) chunks.push(...splitText(t))
  }
  if (!chunks.length) return { added: 0, dim: 0 }

  const vectors = await embed(opts.provider, chunks)
  const dim = vectors[0].length
  const db = getDb()
  ensureVecTable(db, dim)

  const maxRow = (db.prepare('SELECT COALESCE(MAX(rowid), 0) AS m FROM chunk_meta').get() as { m: number }).m
  const insVec = db.prepare('INSERT INTO vec_chunks(rowid, embedding) VALUES (?, ?)')
  const insMeta = db.prepare(
    'INSERT INTO chunk_meta(rowid, source, bookId, chapterId, text) VALUES (?, ?, ?, ?, ?)',
  )
  const tx = db.transaction(() => {
    for (let i = 0; i < chunks.length; i++) {
      // vec0 虚拟表的 rowid 仅接受整数 BigInt（普通 JS number 会被拒）；chunk_meta 同用以对齐
      const rowid = BigInt(maxRow + 1 + i)
      insVec.run(rowid, toBlob(vectors[i]))
      insMeta.run(rowid, opts.meta.source, opts.meta.bookId ?? null, opts.meta.chapterId ?? null, chunks[i])
    }
  })
  tx()
  return { added: chunks.length, dim }
}

/** 检索：embedding query → KNN top-k → join chunk_meta。bookId 给定时内存过滤（阶段 A 简化）。 */
export async function queryVectorStore(opts: {
  queryText: string
  k?: number
  bookId?: string
  provider: ProviderConfig
}): Promise<RagChunk[]> {
  const db = getDb()
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vec_chunks'")
    .get()
  if (!tableExists) return []

  const [queryVec] = await embed(opts.provider, [opts.queryText])
  const k = opts.k ?? 5
  // bookId 过滤在 KNN 之后做，故多取一些候选避免被过滤空
  const limit = opts.bookId ? k * 4 : k
  // 子查询先做 KNN（vec0 KNN 需 LIMIT 为常量，limit 是内部整数无注入风险），外层再 join 元数据
  const rows = db
    .prepare(
      `SELECT m.source AS source, m.bookId AS bookId, m.chapterId AS chapterId, m.text AS text, v.distance AS distance
       FROM (SELECT rowid, distance FROM vec_chunks WHERE embedding MATCH ? ORDER BY distance LIMIT ${limit}) v
       JOIN chunk_meta m ON m.rowid = v.rowid
       ORDER BY v.distance`,
    )
    .all(toBlob(queryVec)) as Array<{
      source: string
      bookId: string | null
      chapterId: string | null
      text: string
      distance: number
    }>
  return rows
    .filter((r) => !opts.bookId || r.bookId === opts.bookId)
    .slice(0, k)
    .map((r) => ({
      source: r.source,
      bookId: r.bookId ?? undefined,
      chapterId: r.chapterId ?? undefined,
      text: r.text,
      distance: r.distance,
    }))
}
