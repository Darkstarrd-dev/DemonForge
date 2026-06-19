import { useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Checkbox,
  Input,
  List,
  Radio,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { RobotOutlined, ReloadOutlined } from '@ant-design/icons'
import { useAppStore, genId } from '../../store/appStore'
import {
  compilePatterns,
  detectChapterPattern,
  splitChapters,
  type DetectResult,
  type SplitResult,
} from '../../utils/split'
import { aiSplitChapter } from '../../services/api'
import type { ImportChapter, SplitPattern } from '../../services/types'

export default function Step2Split() {
  const { message } = App.useApp()
  const session = useAppStore((s) => s.importSession)
  const setState = useAppStore((s) => s.setState)
  const splitPatterns = useAppStore((s) => s.splitPatterns)

  // 编译为运行时形态（regex 为 RegExp|null）
  const runtimePatterns = useMemo(() => compilePatterns(splitPatterns), [splitPatterns])

  // 进入页即自动检测（lazy 初始化，仅首次；rawText 变化时由"重新检测"按钮手动触发）
  const rawText = session?.rawText ?? ''
  const [detect, setDetect] = useState<DetectResult | null>(() =>
    rawText ? detectChapterPattern(rawText, splitPatterns) : null,
  )
  const [patternKey, setPatternKey] = useState<string>(() => {
    if (!rawText) return 'zhang'
    const r = detectChapterPattern(rawText, splitPatterns)
    return r.patternKey !== 'custom' ? r.patternKey : 'zhang'
  })
  const [customRegex, setCustomRegex] = useState('^(第.+章.*)')
  const [keepPrologue, setKeepPrologue] = useState(true)
  const [preview, setPreview] = useState<SplitResult[] | null>(null)
  const [aiSplitting, setAiSplitting] = useState<string | null>(null)

  // Radio options：内置 + 用户自定义模式，custom 永远在末尾
  const radioOptions = useMemo(() => {
    const custom = splitPatterns.find((p) => p.key === 'custom') ?? { key: 'custom', label: '自定义正则', regex: '' }
    const others = splitPatterns.filter((p) => p.key !== 'custom')
    return [...others, custom as SplitPattern].map((p) => ({ value: p.key, label: p.label }))
  }, [splitPatterns])

  const regex = useMemo(() => {
    if (patternKey !== 'custom') return runtimePatterns.find((p) => p.key === patternKey)?.regex ?? null
    try {
      return new RegExp(customRegex)
    } catch {
      return null
    }
  }, [patternKey, customRegex, runtimePatterns])

  // 手动重新检测（按钮触发）
  const runDetect = (silent = false) => {
    if (!rawText) return
    const result = detectChapterPattern(rawText, splitPatterns)
    setDetect(result)
    if (result.patternKey !== 'custom') {
      setPatternKey(result.patternKey)
    }
    if (!silent && result.patternKey === 'custom') {
      message.info('未检测到明显章节模式，请手动选择或输入正则')
    }
  }

  if (!session) return null
  const applied = session.chapters.length > 0

  const runPreview = () => {
    if (!regex) {
      message.error('自定义正则无效')
      return
    }
    setPreview(splitChapters(session.rawText, regex, keepPrologue))
  }

  const applySplit = () => {
    if (!preview) return
    const chapters: ImportChapter[] = preview.map((p) => ({
      id: genId('imp'),
      title: p.title,
      content: p.content,
      cleanStatus: 'pending',
      lineDecisions: {},
      retryCount: 0,
      // 卷标题行单独成章 → Step3 跳过 LLM 清理，原样保留
      skipClean: p.isVolume === true,
    }))
    setState({ importSession: { ...session, chapters } })
    message.success(`已应用切分：${chapters.length} 章`)
  }

  const runAiSplit = async (ch: ImportChapter) => {
    setAiSplitting(ch.id)
    const parts = await aiSplitChapter(ch.title, ch.content)
    const cur = useAppStore.getState().importSession
    if (!cur) return
    if (parts.length <= 1) {
      message.info('AI 判定无需拆分（mock）')
    } else {
      const idx = cur.chapters.findIndex((c) => c.id === ch.id)
      const newOnes: ImportChapter[] = parts.map((p) => ({
        id: genId('imp'),
        title: p.title,
        content: p.content,
        cleanStatus: 'pending',
        lineDecisions: {},
        retryCount: 0,
        skipClean: ch.skipClean,
      }))
      const chapters = [...cur.chapters.slice(0, idx), ...newOnes, ...cur.chapters.slice(idx + 1)]
      setState({ importSession: { ...cur, chapters } })
      message.success(`已拆分为 ${parts.length} 章（mock 演示 >>>CHAPTER_TITLE: 协议）`)
    }
    setAiSplitting(null)
  }

  const detectHigh = detect && detect.patternKey !== 'custom' && detect.confidence >= 0.5

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {detect && (
        <Alert
          type={detect.patternKey === 'custom' ? 'warning' : detectHigh ? 'success' : 'info'}
          showIcon
          icon={<RobotOutlined />}
          message={`自动检测：${detect.reason}`}
          description={
            detect.sampledTitles.length > 0 ? (
              <Space wrap size={4}>
                {detect.sampledTitles.map((t, i) => (
                  <Tag key={i}>{t}</Tag>
                ))}
              </Space>
            ) : undefined
          }
          action={
            <Button size="small" icon={<ReloadOutlined />} onClick={() => runDetect(false)}>
              重新检测
            </Button>
          }
        />
      )}
      <Space wrap align="center">
        <Radio.Group
          value={patternKey}
          onChange={(e) => setPatternKey(e.target.value)}
          options={radioOptions}
        />
      </Space>
      {patternKey === 'custom' && (
        <Input
          style={{ maxWidth: 420 }}
          value={customRegex}
          onChange={(e) => setCustomRegex(e.target.value)}
          placeholder="首个捕获组作为章节标题"
          status={regex ? undefined : 'error'}
        />
      )}
      <Space>
        <Checkbox checked={keepPrologue} onChange={(e) => setKeepPrologue(e.target.checked)}>
          保留第一章之前的内容为「序章」
        </Checkbox>
        <Button type="primary" onClick={runPreview}>
          预览切分结果
        </Button>
      </Space>

      {preview && (
        <>
          <Alert
            type={preview.length > 1 ? 'success' : 'warning'}
            showIcon
            message={
              preview.length > 1
                ? `预计切分为 ${preview.length} 章${
                    preview.some((p) => p.isVolume) ? `（含 ${preview.filter((p) => p.isVolume).length} 个卷标记章，将跳过 AI 清理）` : ''
                  }`
                : '未匹配到章节标题，将全文作为单章（可换模式或用自定义正则）'
            }
          />
          <List
            size="small"
            bordered
            style={{ maxHeight: 240, overflow: 'auto' }}
            dataSource={preview}
            renderItem={(item, i) => (
              <List.Item>
                <Typography.Text type="secondary" style={{ marginRight: 12 }}>
                  {i + 1}
                </Typography.Text>
                {item.title}
                {item.isVolume && (
                  <Tag color="purple" style={{ marginLeft: 8 }}>
                    卷
                  </Tag>
                )}
                <Typography.Text type="secondary" style={{ marginLeft: 'auto' }}>
                  {item.content.length} 字
                </Typography.Text>
              </List.Item>
            )}
          />
          <Button type="primary" onClick={applySplit}>
            {applied ? '重新应用切分（覆盖当前章节）' : '应用切分'}
          </Button>
        </>
      )}

      {applied && (
        <>
          <Typography.Title level={5} style={{ marginBottom: 0 }}>
            已切分章节（{session.chapters.length}）
          </Typography.Title>
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ y: 280 }}
            dataSource={session.chapters}
            columns={[
              { title: '#', render: (_, __, i) => i + 1, width: 50 },
              { title: '标题', dataIndex: 'title' },
              { title: '字数', render: (_, c) => c.content.length, width: 80 },
              {
                title: '状态',
                width: 110,
                render: (_, c) =>
                  c.skipClean ? (
                    <Tag color="purple">卷·跳过清理</Tag>
                  ) : (
                    <Tag>{c.cleanStatus === 'pending' ? '待清理' : c.cleanStatus}</Tag>
                  ),
              },
              {
                title: '操作',
                width: 140,
                render: (_, c) => (
                  <Button
                    size="small"
                    icon={<RobotOutlined />}
                    loading={aiSplitting === c.id}
                    onClick={() => runAiSplit(c)}
                  >
                    AI 重拆
                  </Button>
                ),
              },
            ]}
          />
          <Button
            type="primary"
            onClick={() => setState({ importSession: { ...useAppStore.getState().importSession!, step: 2 } })}
          >
            下一步：AI 清理
          </Button>
        </>
      )}
    </Space>
  )
}
