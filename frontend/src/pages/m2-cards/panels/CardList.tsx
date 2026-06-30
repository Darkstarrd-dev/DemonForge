// M2 设定卡片 · 卡片列表 Tab（过滤面板 + 卡片网格）。
// 受控组件：所有数据 + 回调由父级（m2-cards/index.tsx）传入。
import { Badge, Button, Card, Col, Empty, Input, Radio, Row, Select, Space, Tag, Typography } from 'antd'
import { ExperimentOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { PromptEditorButton } from '../../../components/PromptEditorButton'
import type { Book, EntityCard, EntityType } from '../../../services/types'
import { TYPE_META } from './cardMeta'

export type Scope = 'project' | 'all'
export type TypeFilter = EntityType | 'all'

export interface CardGridProps {
  books: Book[]
  filtered: EntityCard[]
  newIds: string[]
  scope: Scope
  setScope: (s: Scope) => void
  typeFilter: TypeFilter
  setTypeFilter: (t: TypeFilter) => void
  setKeyword: (k: string) => void
  onOpenDetail: (cardId: string) => void
  onOpenExtract: () => void
  onOpenCardEditor: (mode: 'manual' | 'ai') => void
  onOpenBatchGenerate: () => void
}

export default function CardGrid({
  books,
  filtered,
  newIds,
  scope,
  setScope,
  typeFilter,
  setTypeFilter,
  setKeyword,
  onOpenDetail,
  onOpenExtract,
  onOpenCardEditor,
  onOpenBatchGenerate,
}: CardGridProps) {
  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div
        data-slot="filter-panel"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: '#fafafa',
          borderRadius: 8,
          border: '1px solid #f0f0f0',
        }}
      >
        <Radio.Group
          data-slot="select-scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          options={[
            { value: 'project', label: '仅当前作品' },
            { value: 'all', label: '含素材库（全部书）' },
          ]}
          optionType="button"
          size="middle"
        />
        <Select
          data-slot="select-type"
          style={{ minWidth: 130 }}
          value={typeFilter}
          onChange={setTypeFilter}
          size="middle"
          options={[
            { value: 'all', label: '全部类型' },
            ...Object.entries(TYPE_META).map(([v, m]) => ({ value: v, label: m.label })),
          ]}
        />
        <Input.Search
          data-slot="input-search"
          placeholder="搜索名称/别名/描述"
          style={{ width: 260 }}
          allowClear
          size="middle"
          onSearch={setKeyword}
          onChange={(e) => !e.target.value && setKeyword('')}
        />
        <div style={{ width: 1, height: 24, background: '#e8e8e8' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button data-slot="btn-extract" type="primary" icon={<ExperimentOutlined />} onClick={onOpenExtract}>
            从章节提取设定
          </Button>
          <PromptEditorButton promptKey="m2-extract" label="编辑提取提示词" size="middle" />
        </div>
        <div style={{ width: 1, height: 24, background: '#e8e8e8' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button data-slot="btn-add-manual" icon={<PlusOutlined />} onClick={() => onOpenCardEditor('manual')}>
            手动新增
          </Button>
          <Button data-slot="btn-add-ai" icon={<ThunderboltOutlined />} onClick={() => onOpenCardEditor('ai')}>
            AI 生成
          </Button>
          <Button data-slot="btn-add-batch" icon={<ThunderboltOutlined />} onClick={onOpenBatchGenerate}>
            批量 AI 生成
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty description="无匹配卡片" style={{ padding: '60px 0' }} />
      ) : (
        <Row data-slot="list-panel" gutter={[16, 16]}>
          {filtered.map((c) => {
            const book = books.find((b) => b.id === c.bookId)
            return (
              <Col key={c.id} xs={24} sm={12} md={8} lg={6} xl={6}>
                <Badge.Ribbon
                  text="新提取"
                  color="volcano"
                  style={{ display: newIds.includes(c.id) ? undefined : 'none' }}
                >
                  <Card
                    data-slot={`card-${c.id}`}
                    size="small"
                    hoverable
                    onClick={() => onOpenDetail(c.id)}
                    style={{ height: '100%', borderRadius: 8, transition: 'all 0.2s ease' }}
                    styles={{ body: { padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 } }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <Space size={8} style={{ flex: 1, minWidth: 0 }}>
                        <Tag color={TYPE_META[c.type].color} style={{ margin: 0, flexShrink: 0, fontWeight: 500 }}>
                          {TYPE_META[c.type].label}
                        </Tag>
                        <Typography.Text strong ellipsis style={{ fontSize: 14, lineHeight: '22px' }}>
                          {c.name}
                        </Typography.Text>
                      </Space>
                      <Tag
                        color={book ? (book.type === 'project' ? 'blue' : 'default') : 'gold'}
                        style={{ margin: 0, flexShrink: 0, fontSize: 12 }}
                      >
                        {book?.title ?? '素材库'}
                      </Tag>
                    </div>
                    <Typography.Paragraph
                      type="secondary"
                      ellipsis={{ rows: 2 }}
                      style={{ marginBottom: 0, fontSize: 13, lineHeight: '20px', color: '#666' }}
                    >
                      {c.description}
                    </Typography.Paragraph>
                    {c.aliases.length > 0 && (
                      <Typography.Text type="secondary" style={{ fontSize: 12, color: '#999' }}>
                        别名：{c.aliases.join(' / ')}
                      </Typography.Text>
                    )}
                  </Card>
                </Badge.Ribbon>
              </Col>
            )
          })}
        </Row>
      )}
    </Space>
  )
}
