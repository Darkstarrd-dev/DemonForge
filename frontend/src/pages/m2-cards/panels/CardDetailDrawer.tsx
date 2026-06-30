// M2 设定卡片 · 详情 Drawer（含编辑表单 + 图片素材 + 出处引用 + 原文出处 Modal）。
// 受控组件：所有状态 + 回调由父级传入。
import { useState } from 'react'
import {
  Button,
  Descriptions,
  Drawer,
  Form,
  Image,
  Input,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { FormInstance } from 'antd'
import { DeleteOutlined, DownloadOutlined, PictureOutlined, StarFilled, StarOutlined, ThunderboltOutlined } from '@ant-design/icons'
import type { Book, CardImage, Chapter, EntityCard } from '../../../services/types'
import { TYPE_META } from './cardMeta'

export interface CardEditFormValues {
  bookId: string
  name: string
  aliases: string[]
  description: string
  styleNote?: string
  /** 台词例句（每行一句）— 表单中是字符串，提交时由父级 split 为数组 */
  styleExamples?: string
}

export interface CardDetailDrawerProps {
  open: boolean
  detail: EntityCard | null
  editing: boolean
  onClose: () => void
  onEditStart: () => void
  onEditCancel: () => void
  onEditSave: (values: {
    bookId: string
    name: string
    aliases: string[]
    description: string
    styleNote?: string
    styleExamples?: string
  }) => void
  books: Book[]
  chapters: Chapter[]
  editForm: FormInstance<CardEditFormValues>
  onDownloadImage: (url: string) => void
  onDeleteImage: (imgId: string) => void
  onSetCover: (imgId: string) => void
  onOpenImageBatch: () => void
  /** 出处引用点击 → 打开原文出处 Modal */
  onOpenRef: (ref: { chapterId: string; excerpt: string }) => void
}

export default function CardDetailDrawer({
  open,
  detail,
  editing,
  onClose,
  onEditStart,
  onEditCancel,
  onEditSave,
  books,
  chapters,
  editForm,
  onDownloadImage,
  onDeleteImage,
  onSetCover,
  onOpenImageBatch,
  onOpenRef,
}: CardDetailDrawerProps) {
  const [refModal, setRefModal] = useState<{ chapterId: string; excerpt: string } | null>(null)

  return (
    <>
      <Drawer
        title={
          detail && (
            <Space size={12}>
              <Tag color={TYPE_META[detail.type].color} style={{ margin: 0, fontWeight: 500, fontSize: 13 }}>
                {TYPE_META[detail.type].label}
              </Tag>
              <Typography.Text strong style={{ fontSize: 16 }}>
                {detail.name}
              </Typography.Text>
            </Space>
          )
        }
        width={580}
        open={open}
        onClose={onClose}
        extra={
          detail && !editing ? (
            <Button onClick={onEditStart}>编辑</Button>
          ) : detail ? (
            <Space>
              <Button
                type="primary"
                onClick={async () => {
                  const values = await editForm.validateFields()
                  onEditSave(values as Parameters<typeof onEditSave>[0])
                }}
              >
                保存
              </Button>
              <Button onClick={onEditCancel}>取消</Button>
            </Space>
          ) : null
        }
        styles={{ body: { padding: '24px' } }}
      >
        {detail && !editing && (
          <Space direction="vertical" size={24} style={{ width: '100%' }}>
            <Descriptions
              bordered
              size="small"
              column={1}
              items={[
                { key: 'aliases', label: '别名', children: detail.aliases.join(' / ') || '—' },
                ...Object.entries(detail.fields).map(([k, v]) => ({ key: k, label: k, children: v })),
              ]}
            />

            {/* 封面与描述 */}
            <div>
              {(() => {
                const imgs = detail.images ?? []
                const cover = imgs.find((i) => i.id === detail.coverImageId) ?? imgs[0]
                return (
                  <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                    <div
                      style={{
                        width: 180,
                        flexShrink: 0,
                        aspectRatio: '1 / 1',
                        border: '1px solid #f0f0f0',
                        borderRadius: 8,
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#fafafa',
                      }}
                    >
                      {cover ? (
                        <Image src={cover.url} width="100%" height="100%" style={{ objectFit: 'contain' }} />
                      ) : (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          暂无主图
                        </Typography.Text>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
                        描述
                      </Typography.Title>
                      <Typography.Paragraph style={{ color: '#666', lineHeight: 1.8 }}>
                        {detail.description}
                      </Typography.Paragraph>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* 语言风格 */}
            {detail.styleNote && (
              <div>
                <Typography.Title level={5} style={{ marginBottom: 12 }}>
                  语言风格（M3 推演约束）
                </Typography.Title>
                <Typography.Paragraph style={{ color: '#666', lineHeight: 1.8 }}>
                  {detail.styleNote}
                </Typography.Paragraph>
                {detail.styleExamples?.map((ex, i) => (
                  <Typography.Paragraph key={i} style={{ marginBottom: 8 }}>
                    <Tag color="blue">例句</Tag>
                    <span style={{ color: '#666' }}>{ex}</span>
                  </Typography.Paragraph>
                ))}
              </div>
            )}

            {/* 图片素材 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  <PictureOutlined /> 图片素材
                </Typography.Title>
                <Button size="small" icon={<ThunderboltOutlined />} onClick={onOpenImageBatch}>
                  批量生成图片
                </Button>
              </div>
              {(() => {
                const imgs = detail.images ?? []
                if (imgs.length === 0) {
                  return (
                    <Typography.Text
                      type="secondary"
                      style={{ fontSize: 12, display: 'block', padding: '20px 0', textAlign: 'center', background: '#fafafa', borderRadius: 6 }}
                    >
                      暂无图片，点击「批量生成图片」准备表情差分 / 全身形象 / 场景背景等素材。
                    </Typography.Text>
                  )
                }
                const groups = new Map<string, CardImage[]>()
                for (const im of imgs) {
                  const g = im.group || '默认'
                  if (!groups.has(g)) groups.set(g, [])
                  groups.get(g)!.push(im)
                }
                return (
                  <Image.PreviewGroup>
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                      {[...groups.entries()].map(([g, list]) => (
                        <div key={g}>
                          <Tag color="geekblue" style={{ marginBottom: 8 }}>
                            {g}（{list.length}）
                          </Tag>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                              gap: 10,
                            }}
                          >
                            {list.map((im) => (
                              <div key={im.id} style={{ position: 'relative' }}>
                                <Tooltip title={im.prompt}>
                                  <Image
                                    src={im.url}
                                    width="100%"
                                    height={120}
                                    style={{
                                      objectFit: 'contain',
                                      borderRadius: 6,
                                      border: '1px solid #f0f0f0',
                                      ...(im.id === detail.coverImageId ? { outline: '2px solid #faad14', outlineOffset: -2 } : {}),
                                    }}
                                  />
                                </Tooltip>
                                <Space
                                  size={2}
                                  style={{
                                    position: 'absolute',
                                    top: 4,
                                    right: 4,
                                    background: 'rgba(0,0,0,0.5)',
                                    borderRadius: 4,
                                    padding: '2px 4px',
                                  }}
                                >
                                  <Tooltip title={im.id === detail.coverImageId ? '当前主图' : '设为主图'}>
                                    <Button
                                      size="small"
                                      type="text"
                                      icon={
                                        im.id === detail.coverImageId ? (
                                          <StarFilled style={{ color: '#faad14' }} />
                                        ) : (
                                          <StarOutlined style={{ color: '#fff' }} />
                                        )
                                      }
                                      onClick={() => onSetCover(im.id)}
                                    />
                                  </Tooltip>
                                  <Tooltip title="下载">
                                    <Button
                                      size="small"
                                      type="text"
                                      icon={<DownloadOutlined style={{ color: '#fff' }} />}
                                      onClick={() => onDownloadImage(im.url)}
                                    />
                                  </Tooltip>
                                  <Popconfirm
                                    title="删除该图片？"
                                    okText="删除"
                                    okButtonProps={{ danger: true }}
                                    onConfirm={() => onDeleteImage(im.id)}
                                  >
                                    <Button size="small" type="text" icon={<DeleteOutlined style={{ color: '#fff' }} />} />
                                  </Popconfirm>
                                </Space>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </Space>
                  </Image.PreviewGroup>
                )
              })()}
            </div>

            {/* 出处引用 */}
            <div>
              <Typography.Title level={5} style={{ marginBottom: 12 }}>
                出处引用（点击回溯原文）
              </Typography.Title>
              <List
                size="small"
                bordered
                dataSource={detail.refs}
                locale={{ emptyText: '无出处记录' }}
                style={{ borderRadius: 6 }}
                renderItem={(r) => {
                  const ch = chapters.find((c) => c.id === r.chapterId)
                  return (
                    <List.Item
                      style={{ cursor: 'pointer', padding: '12px 16px' }}
                      onClick={() => {
                        setRefModal(r)
                        onOpenRef(r)
                      }}
                    >
                      <Space direction="vertical" size={4}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {ch ? `${books.find((b) => b.id === ch.bookId)?.title ?? ''} · ${ch.title}` : '（章节不在库中）'}
                        </Typography.Text>
                        <Typography.Text style={{ color: '#333' }}>「{r.excerpt}」</Typography.Text>
                      </Space>
                    </List.Item>
                  )
                }}
              />
            </div>
          </Space>
        )}

        {detail && editing && (
          <Form form={editForm} layout="vertical" style={{ maxWidth: 480 }}>
            <Form.Item name="bookId" label="归属">
              <Select
                options={[
                  { value: '', label: '素材库（不归属任何书）' },
                  ...books.map((b) => ({ value: b.id, label: `${b.title}（${b.type === 'project' ? '作品' : '素材'}）` })),
                ]}
              />
            </Form.Item>
            <Form.Item name="name" label="名称" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="aliases" label="别名">
              <Select mode="tags" placeholder="输入后回车添加" />
            </Form.Item>
            <Form.Item name="description" label="描述">
              <Input.TextArea autoSize={{ minRows: 4 }} />
            </Form.Item>
            {detail.type === 'character' && (
              <>
                <Form.Item name="styleNote" label="语言风格描述">
                  <Input.TextArea autoSize={{ minRows: 2 }} />
                </Form.Item>
                <Form.Item name="styleExamples" label="台词例句（每行一句）">
                  <Input.TextArea autoSize={{ minRows: 3 }} />
                </Form.Item>
              </>
            )}
          </Form>
        )}
      </Drawer>

      <Modal
        title="原文出处"
        open={!!refModal}
        footer={null}
        onCancel={() => setRefModal(null)}
        width={640}
      >
        {refModal &&
          (() => {
            const ch = chapters.find((c) => c.id === refModal.chapterId)
            if (!ch) return <Typography.Text type="secondary">章节不在库中（可能来自导入会话）</Typography.Text>
            const idx = ch.content.indexOf(refModal.excerpt.replace(/^「|」$/g, ''))
            const center = idx >= 0 ? idx : 0
            const slice = ch.content.slice(Math.max(0, center - 120), center + 240)
            return (
              <div className="prose-view">
                <Typography.Title level={5}>{ch.title}</Typography.Title>
                …{slice}…
              </div>
            )
          })()}
      </Modal>
    </>
  )
}
