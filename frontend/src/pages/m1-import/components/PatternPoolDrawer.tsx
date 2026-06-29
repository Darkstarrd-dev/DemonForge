import { useState } from 'react'
import { App, Button, Drawer, Form, Input, Modal, Space, Table, Tag } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import { genId, useAppStore } from '../../../store/appStore'
import type { SplitPattern } from '../../../services/types'

export default function PatternPoolDrawer() {
  const { message } = App.useApp()
  const splitPatterns = useAppStore((s) => s.splitPatterns)
  const setSplitPatterns = useAppStore((s) => s.setSplitPatterns)
  const resetSplitPatterns = useAppStore((s) => s.resetSplitPatterns)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingPattern, setEditingPattern] = useState<SplitPattern | null>(null)
  const [patternForm] = Form.useForm<{ label: string; regex: string }>()

  const openPatternEdit = (p?: SplitPattern) => {
    const target = p ?? { key: genId('pat'), label: '', regex: '', builtin: false }
    setEditingPattern(target)
    patternForm.setFieldsValue({ label: target.label, regex: target.regex })
  }

  const savePatternEdit = async () => {
    const values = await patternForm.validateFields()
    const merged = { ...editingPattern!, ...values } as SplitPattern
    if (merged.key !== 'custom' && merged.regex) {
      try {
        new RegExp(merged.regex)
      } catch {
        message.error('正则表达式无效，请检查语法')
        return
      }
    }
    const exists = splitPatterns.some((p) => p.key === merged.key)
    setSplitPatterns(
      exists ? splitPatterns.map((p) => (p.key === merged.key ? merged : p)) : [...splitPatterns, merged],
    )
    setEditingPattern(null)
    message.success('检测模式已保存')
  }

  const deletePattern = (p: SplitPattern) => {
    if (p.key === 'custom') {
      message.warning('「自定义正则」模式不可删除')
      return
    }
    setSplitPatterns(splitPatterns.filter((x) => x.key !== p.key))
    message.success('已删除')
  }

  return (
    <>
      <Button size="small" icon={<SettingOutlined />} onClick={() => setDrawerOpen(true)}>
        检测模式
      </Button>

      <Drawer
        title="章节检测模式池"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={640}
        destroyOnClose
        footer={
          <Space>
            <Button onClick={() => { resetSplitPatterns(); message.success('已恢复默认模式') }}>恢复默认</Button>
            <Button type="primary" onClick={() => openPatternEdit()}>新增模式</Button>
          </Space>
        }
      >
        <Table
          rowKey="key"
          pagination={false}
          size="middle"
          dataSource={splitPatterns}
          columns={[
            { title: '名称', dataIndex: 'label', width: 160 },
            { title: '正则表达式', dataIndex: 'regex', ellipsis: true },
            { title: '内置', dataIndex: 'builtin', width: 80, render: (v: boolean) => v ? <Tag>是</Tag> : <Tag>否</Tag> },
            {
              title: '操作', key: 'actions', width: 150, render: (_: unknown, row: SplitPattern) => (
                <Space size="small">
                  <Button size="small" onClick={() => openPatternEdit(row)}>编辑</Button>
                  <Button size="small" danger onClick={() => deletePattern(row)} disabled={row.key === 'custom'}>删除</Button>
                </Space>
              )
            }
          ]}
        />
      </Drawer>

      <Modal
        title={splitPatterns.some((p) => p.key === editingPattern?.key) ? '编辑检测模式' : '新增检测模式'}
        open={!!editingPattern}
        onOk={savePatternEdit}
        onCancel={() => setEditingPattern(null)}
        destroyOnClose
        width={Math.min(600, window.innerWidth - 48)}
      >
        <Form form={patternForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="label" label="名称" rules={[{ required: true }]}>
            <Input placeholder="如：第X章" />
          </Form.Item>
          <Form.Item
            name="regex"
            label="正则表达式"
            rules={[{ required: true, message: '请输入正则（custom 模式除外）' }]}
            extra="以 ^ 开头整行匹配，含一个捕获组作为标题。如：^(第[0-9一二三四五六七八九十]+章.*)"
          >
            <Input placeholder="^(第[0-9零一二三四五六七八九十百千万]+章.*)" style={{ fontFamily: 'monospace' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
