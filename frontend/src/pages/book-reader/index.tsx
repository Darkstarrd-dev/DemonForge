import { useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Button, Empty } from 'antd'
import { useAppStore } from '../../store/appStore'
import ImmersiveReader from './ImmersiveReader'

/**
 * 书库阅读：从「书库概览 → 打开」进入，直接全屏沉浸式阅读。
 *
 * 本页只负责选书与空态兜底，真正的阅读 / 编辑交互全部在 ImmersiveReader 内：
 *  - 章节列表（左侧抽屉，可改章节名）、书签（左侧抽屉，可增删）
 *  - 字体滑条、自动播放（逐屏）、自动翻页（连续滚动调速）、编辑正文、主题切换
 *
 * 路由：/book-reader?bookId=xxx（无 bookId 则取书库第一本）。
 */
export default function BookReaderPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const books = useAppStore((s) => s.books)
  const chapters = useAppStore((s) => s.chapters)

  // 当前书：优先 query；query 指向不存在的书则回退书库第一本。
  const queryBookId = params.get('bookId') ?? ''
  const bookId =
    (queryBookId && books.some((b) => b.id === queryBookId) && queryBookId) || books[0]?.id || ''

  const bookChapters = useMemo(
    () => chapters.filter((c) => c.bookId === bookId).sort((a, b) => a.index - b.index),
    [chapters, bookId],
  )

  if (!bookId || bookChapters.length === 0) {
    return (
      <Empty
        description={bookId ? '该书暂无章节' : '未选择书籍'}
        style={{ marginTop: 80 }}
      >
        <Button type="primary" onClick={() => navigate(bookId ? '/m1' : '/')}>
          {bookId ? '去导入文本' : '返回书库'}
        </Button>
      </Empty>
    )
  }

  return (
    <ImmersiveReader
      chapters={bookChapters}
      initialChapterId={bookChapters[0].id}
      bookId={bookId}
      onExit={() => navigate('/')}
    />
  )
}
