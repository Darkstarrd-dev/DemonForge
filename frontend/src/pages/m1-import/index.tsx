import { App, Card, Steps } from 'antd'
import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore'
import type { ImportSession } from '../../services/types'
import Step1Import from './Step1Import'
import Step2Split from './Step2Split'
import Step3Clean from './Step3Clean'
import Step4Review from './Step4Review'

export default function M1ImportPage() {
  const { modal, message } = App.useApp()
  const session = useAppStore((s) => s.importSession)
  const cleanRun = useAppStore((s) => s.cleanRun)
  const setState = useAppStore((s) => s.setState)
  const step = session?.step ?? 0
  const recovered = useRef(false)
  const isCleanMode = !!session?.targetBookId

  // 恢复持久化的导入会话（退出/刷新后不丢进度）：将中途中断的 processing 章回退为 pending
  useEffect(() => {
    if (recovered.current || session) return
    recovered.current = true
    fetch('/api/import-session')
      .then((r) => r.ok ? r.json() : null)
      .then((d: { session: ImportSession | null } | null) => {
        if (!d?.session) return
        const saved = d.session
        // 正在清理的章节 → 回退为 pending 重跑（LLM 断点无法恢复中间态）
        const fixedChapters = saved.chapters.map((c) =>
          c.cleanStatus === 'processing' ? { ...c, cleanStatus: 'pending' as const } : c,
        )
        setState({ importSession: { ...saved, chapters: fixedChapters } })
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const gotoStep = (target: number) => {
    if (!session || target === step) return

    // 清理模式：仅允许在 2↔3 间切换，不允许回到 0/1
    if (isCleanMode) {
      if (target < 2) return
      if (target < step) {
        setState({ importSession: { ...session, step: target } })
        if (target <= 2 && cleanRun?.running) {
          message.info('文本清理任务仍在后台运行，切回 Step3 可继续控制')
        }
      }
      return
    }

    // 新建模式：回退到导入步 = 重新开始；其余回退仅切换视图，向前由各步按钮推进
    if (target === 0 && step > 0) {
      modal.confirm({
        title: '返回导入步骤？',
        content: '重新导入文件将清空当前切分与清理进度。仅查看请取消。',
        okText: '清空并重新导入',
        onOk: () => setState({ importSession: null }),
      })
      return
    }
    if (target < step) {
      setState({ importSession: { ...session, step: target } })
      // 切回 Step3 时若清理任务仍在后台运行，提示用户
      if (target <= 2 && cleanRun?.running) {
        message.info('文本清理任务仍在后台运行，切回 Step3 可继续控制')
      }
    }
  }

  // Steps items：清理模式仅 2 项（文本清理 + 审核与入库）
  const stepsItems = isCleanMode
    ? [
        { title: '文本清理', description: 'AI' },
        { title: '审核与入库', description: '行级 diff 审核' },
      ]
    : [
        { title: '导入文件', description: '编码检测' },
        { title: '章节分割', description: '规则 + AI 兜底' },
        { title: '文本清理', description: 'AI' },
        { title: '审核与入库', description: '行级 diff 审核' },
      ]

  // current 映射：清理模式 step 2→0, 3→1；新建模式直接用 step
  const displayCurrent = isCleanMode ? step - 2 : step

  return (
    <Card data-slot="m1-import">
      <Steps
        data-slot="steps"
        current={displayCurrent}
        onChange={(displayIdx) => {
          // 清理模式：显示 index 0→内部 step 2，1→内部 step 3
          const internalStep = isCleanMode ? displayIdx + 2 : displayIdx
          gotoStep(internalStep)
        }}
        items={stepsItems}
        style={{ marginBottom: 24 }}
      />
      {step === 0 && <Step1Import />}
      {step === 1 && <Step2Split />}
      {step === 2 && <Step3Clean />}
      {step === 3 && <Step4Review />}
    </Card>
  )
}
