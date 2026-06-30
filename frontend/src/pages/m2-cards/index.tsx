// M2 设定卡片 · 主组件（重构自 888 行巨组件）。
// 状态分层：
//   - 编排级：scope / typeFilter / keyword / detailId / editing / newIds / 模态开关
//   - 数据级：来自 store 的 cards/books/chapters/mergeCandidates + 通过 setState 修改
//   - UI 面板：CardGrid / MergeTab / CardDetailDrawer / ExtractModal（独立组件）
import { useMemo, useState } from 'react'
import { App, Badge, Form, Tabs } from 'antd'
import { MergeCellsOutlined } from '@ant-design/icons'
import { useAppStore, pushStoreNow } from '../../store/appStore'
import { extractEntities } from '../../services/api'
import type { EntityCard, ResolvedProviderNode } from '../../services/types'
import type { ExtractProgress } from '../../services/api'
import { resolveProviderNodes } from '../../utils/providerResolver'
import CardEditorModal from './CardEditorModal'
import ImageBatchModal from './ImageBatchModal'
import BatchCardModal from './BatchCardModal'
import CardGrid, { type Scope, type TypeFilter } from './panels/CardList'
import MergeTab from './panels/MergeTab'
import CardDetailDrawer from './panels/CardDetailDrawer'
import ExtractModal from './panels/ExtractModal'

export default function M2CardsPage() {
  const { message } = App.useApp()
  const cards = useAppStore((s) => s.cards)
  const books = useAppStore((s) => s.books)
  const chapters = useAppStore((s) => s.chapters)
  const currentBookId = useAppStore((s) => s.currentBookId)
  const mergeCandidates = useAppStore((s) => s.mergeCandidates)
  const providers = useAppStore((s) => s.providers)
  const providerNodes = useAppStore((s) => s.providerNodes)
  const moduleMapping = useAppStore((s) => s.moduleMapping)
  const setState = useAppStore((s) => s.setState)
  const updateCard = useAppStore((s) => s.updateCard)
  const resolvedNodes: ResolvedProviderNode[] = useMemo(
    () => resolveProviderNodes({ providers, providerNodes }),
    [providers, providerNodes],
  )

  const [scope, setScope] = useState<Scope>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [keyword, setKeyword] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [extractOpen, setExtractOpen] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractProgress, setExtractProgress] = useState<ExtractProgress | null>(null)
  const [activeTab, setActiveTab] = useState<'cards' | 'merge'>('cards')
  const [newIds, setNewIds] = useState<string[]>([])
  const [cardEditor, setCardEditor] = useState<{ mode: 'manual' | 'ai' } | null>(null)
  const [batchCardId, setBatchCardId] = useState<string | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [extractForm] = Form.useForm<{ bookId: string }>()
  const [editForm] = Form.useForm<import('./panels/CardDetailDrawer').CardEditFormValues>()

  const defaultTextNodeId = moduleMapping.m2Extract?.nodeId ?? undefined
  const defaultImageNodeId = resolvedNodes.find((p) => p.nodeType === 'image' && p.enabled)?.id ?? undefined

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (scope === 'project' && c.bookId !== currentBookId) return false
      if (typeFilter !== 'all' && c.type !== typeFilter) return false
      if (
        keyword &&
        !c.name.includes(keyword) &&
        !c.aliases.some((a) => a.includes(keyword)) &&
        !c.description.includes(keyword)
      )
        return false
      return true
    })
  }, [cards, scope, typeFilter, keyword, currentBookId])

  const detail = cards.find((c) => c.id === detailId) ?? null
  const pendingMerges = mergeCandidates.filter((m) => m.status === 'pending')

  const runExtract = async () => {
    const { bookId } = await extractForm.validateFields()
    setExtracting(true)
    setExtractProgress(null)
    try {
      const bookChapters = chapters.filter((c) => c.bookId === bookId)
      const existing = cards.map((c) => c.name)
      const result = await extractEntities(
        bookId,
        bookChapters,
        existing,
        (progress) => setExtractProgress(progress),
        undefined,
        useAppStore.getState().promptOverrides['m2-extract'] || undefined,
      )
      if (result.cards.length === 0) {
        message.info('未提取到新实体（已有卡片覆盖，或章节中无可识别实体）')
      } else {
        setState({
          cards: [...useAppStore.getState().cards, ...result.cards],
          mergeCandidates: [...useAppStore.getState().mergeCandidates, ...result.mergeCandidates],
        })
        setNewIds(result.cards.map((c) => c.id))
        message.success(`提取到 ${result.cards.length} 张新卡片`)
        if (result.mergeCandidates.length > 0) {
          message.info(`发现 ${result.mergeCandidates.length} 组潜在重复实体，已自动跳转到合并裁决`)
          setActiveTab('merge')
        }
      }
    } catch (err) {
      message.error(`提取失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setExtracting(false)
      setExtractProgress(null)
      setExtractOpen(false)
    }
  }

  const doMerge = (mergeId: string, action: 'merged' | 'kept') => {
    const m = mergeCandidates.find((x) => x.id === mergeId)
    if (!m) return
    if (action === 'merged') {
      const a = cards.find((c) => c.id === m.cardAId)
      const b = cards.find((c) => c.id === m.cardBId)
      if (a && b) {
        updateCard(a.id, {
          aliases: [...new Set([...a.aliases, b.name, ...b.aliases])],
          refs: [...a.refs, ...b.refs],
        })
        setState({
          cards: useAppStore.getState().cards.filter((c) => c.id !== b.id),
          mergeCandidates: mergeCandidates.map((x) => (x.id === mergeId ? { ...x, status: 'merged' } : x)),
        })
        message.success(`已合并：「${b.name}」并入「${a.name}」（别名与出处已迁移）`)
        return
      }
    }
    setState({
      mergeCandidates: mergeCandidates.map((x) => (x.id === mergeId ? { ...x, status: 'kept' } : x)),
    })
    message.info('已保持独立')
  }

  const saveEdit = (values: {
    bookId: string
    name: string
    aliases: string[]
    description: string
    styleNote?: string
    styleExamples?: string
  }) => {
    if (!detail) return
    // form 中 styleExamples 是按行分隔的字符串，存储时 split 为数组
    const styleExamples = values.styleExamples
      ? values.styleExamples
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined
    updateCard(detail.id, {
      bookId: values.bookId,
      name: values.name,
      aliases: values.aliases,
      description: values.description,
      styleNote: values.styleNote,
      styleExamples,
      updatedAt: new Date().toISOString(),
    })
    setEditing(false)
    message.success('卡片已保存')
  }

  const handleCardSaved = (card: EntityCard) => {
    setState({ cards: [...useAppStore.getState().cards, card] })
    pushStoreNow()
    setCardEditor(null)
    setNewIds([card.id])
    setDetailId(card.id)
    setEditing(false)
    message.success(`已新增卡片「${card.name}」`)
  }

  const handleSavedMany = (newCards: EntityCard[]) => {
    setState({ cards: [...useAppStore.getState().cards, ...newCards] })
    pushStoreNow()
    setBatchOpen(false)
    setNewIds(newCards.map((c) => c.id))
    message.success(`已批量新增 ${newCards.length} 张卡片`)
  }

  const handleSaveImage = (cardId: string, img: import('../../services/types').CardImage) => {
    const c = useAppStore.getState().cards.find((x) => x.id === cardId)
    if (!c) return
    updateCard(cardId, { images: [...(c.images ?? []), img], updatedAt: new Date().toISOString() })
    pushStoreNow()
  }

  const handleDeleteImage = (cardId: string, imgId: string) => {
    const c = useAppStore.getState().cards.find((x) => x.id === cardId)
    if (!c) return
    updateCard(cardId, { images: (c.images ?? []).filter((i) => i.id !== imgId), updatedAt: new Date().toISOString() })
    pushStoreNow()
  }

  const downloadImage = async (url: string) => {
    try {
      const blob = await (await fetch(url)).blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = decodeURIComponent(url.split('/').pop() || `image-${Date.now()}`)
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      message.error('下载失败')
    }
  }

  const onSetCover = (imgId: string) => {
    if (!detail) return
    updateCard(detail.id, { coverImageId: imgId, updatedAt: new Date().toISOString() })
    pushStoreNow()
  }

  return (
    <div data-slot="m2-cards">
      <Tabs
        data-slot="tabs"
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'cards' | 'merge')}
        items={[
          {
            key: 'cards',
            label: `卡片库（${filtered.length}）`,
            children: (
              <CardGrid
                books={books}
                filtered={filtered}
                newIds={newIds}
                scope={scope}
                setScope={setScope}
                typeFilter={typeFilter}
                setTypeFilter={setTypeFilter}
                setKeyword={setKeyword}
                onOpenDetail={(id) => {
                  setDetailId(id)
                  setEditing(false)
                }}
                onOpenExtract={() => setExtractOpen(true)}
                onOpenCardEditor={(mode) => setCardEditor({ mode })}
                onOpenBatchGenerate={() => setBatchOpen(true)}
              />
            ),
          },
          {
            key: 'merge',
            label: (
              <Badge count={pendingMerges.length} size="small" offset={[8, 0]}>
                <span>
                  <MergeCellsOutlined /> 合并裁决
                </span>
              </Badge>
            ),
            children: <MergeTab cards={cards} pendingMerges={pendingMerges} onMerge={doMerge} />,
          },
        ]}
      />

      <CardDetailDrawer
        open={!!detail}
        detail={detail}
        editing={editing}
        onClose={() => setDetailId(null)}
        onEditStart={() => {
          if (!detail) return
          editForm.setFieldsValue({
            bookId: detail.bookId,
            name: detail.name,
            aliases: detail.aliases,
            description: detail.description,
            styleNote: detail.styleNote,
            styleExamples: detail.styleExamples?.join('\n'),
          })
          setEditing(true)
        }}
        onEditCancel={() => setEditing(false)}
        onEditSave={saveEdit}
        books={books}
        chapters={chapters}
        editForm={editForm}
        onDownloadImage={downloadImage}
        onDeleteImage={(imgId) => detail && handleDeleteImage(detail.id, imgId)}
        onSetCover={onSetCover}
        onOpenImageBatch={() => detail && setBatchCardId(detail.id)}
        onOpenRef={() => {}}
      />

      <ExtractModal
        open={extractOpen}
        extracting={extracting}
        extractProgress={extractProgress}
        books={books}
        chapters={chapters}
        currentBookId={currentBookId}
        extractForm={extractForm}
        onOk={runExtract}
        onCancel={() => setExtractOpen(false)}
      />

      {cardEditor && (
        <CardEditorModal
          initialMode={cardEditor.mode}
          books={books}
          providers={resolvedNodes}
          defaultTextNodeId={defaultTextNodeId}
          defaultBookId={currentBookId || books[0]?.id}
          onClose={() => setCardEditor(null)}
          onSaved={handleCardSaved}
        />
      )}

      {batchOpen && (
        <BatchCardModal
          books={books}
          providers={resolvedNodes}
          defaultTextNodeId={defaultTextNodeId}
          defaultBookId=""
          onClose={() => setBatchOpen(false)}
          onSavedMany={handleSavedMany}
        />
      )}

      {batchCardId &&
        (() => {
          const bc = cards.find((c) => c.id === batchCardId)
          if (!bc) return null
          return (
            <ImageBatchModal
              card={bc}
              providers={resolvedNodes}
              defaultTextNodeId={defaultTextNodeId}
              defaultImageNodeId={defaultImageNodeId}
              onClose={() => setBatchCardId(null)}
              onSaveImage={(img) => handleSaveImage(bc.id, img)}
            />
          )
        })()}
    </div>
  )
}
