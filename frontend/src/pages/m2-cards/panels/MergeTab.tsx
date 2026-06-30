// M2 设定卡片 · 合并裁决 Tab。
// 受控组件：pendingMerges + cards 由父级传入。
import { Button, Card, Col, List, Progress, Row, Space, Typography } from 'antd'
import type { EntityCard, MergeCandidate } from '../../../services/types'

export interface MergeTabProps {
  cards: EntityCard[]
  pendingMerges: MergeCandidate[]
  onMerge: (mergeId: string, action: 'merged' | 'kept') => void
}

export default function MergeTab({ cards, pendingMerges, onMerge }: MergeTabProps) {
  return (
    <List
      dataSource={pendingMerges}
      locale={{ emptyText: '无待裁决的合并候选（M2 提取时由 embedding 相似度 + LLM 判定产生）' }}
      renderItem={(m) => {
        const a = cards.find((c) => c.id === m.cardAId)
        const b = cards.find((c) => c.id === m.cardBId)
        if (!a || !b) return null
        return (
          <List.Item>
            <Card size="small" style={{ width: '100%', borderRadius: 8 }} styles={{ body: { padding: 20 } }}>
              <Row gutter={24} align="middle">
                <Col span={9}>
                  <Card
                    size="small"
                    title={a.name}
                    style={{ height: '100%', borderRadius: 6, border: '1px solid #f0f0f0' }}
                    styles={{ body: { padding: '12px 16px' } }}
                  >
                    <Typography.Paragraph ellipsis={{ rows: 3 }} style={{ marginBottom: 0, color: '#666' }}>
                      {a.description}
                    </Typography.Paragraph>
                  </Card>
                </Col>
                <Col span={6} style={{ textAlign: 'center' }}>
                  <Progress
                    type="circle"
                    size={72}
                    percent={Math.round(m.similarity * 100)}
                    format={(p) => `${p}%`}
                    strokeColor={m.similarity > 0.8 ? '#52c41a' : m.similarity > 0.6 ? '#faad14' : '#1677ff'}
                  />
                  <div style={{ marginTop: 8 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      embedding 相似度
                    </Typography.Text>
                  </div>
                  <Space style={{ marginTop: 12 }}>
                    <Button type="primary" size="small" onClick={() => onMerge(m.id, 'merged')}>
                      确认合并 →
                    </Button>
                    <Button size="small" onClick={() => onMerge(m.id, 'kept')}>
                      保持独立
                    </Button>
                  </Space>
                </Col>
                <Col span={9}>
                  <Card
                    size="small"
                    title={`${b.name}（并入左侧后删除）`}
                    style={{ height: '100%', borderRadius: 6, border: '1px solid #f0f0f0' }}
                    styles={{ body: { padding: '12px 16px' } }}
                  >
                    <Typography.Paragraph ellipsis={{ rows: 3 }} style={{ marginBottom: 0, color: '#666' }}>
                      {b.description}
                    </Typography.Paragraph>
                  </Card>
                </Col>
              </Row>
            </Card>
          </List.Item>
        )
      }}
    />
  )
}
