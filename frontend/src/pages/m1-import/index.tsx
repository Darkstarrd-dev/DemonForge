import { App, Card, Steps } from 'antd'
import { useAppStore } from '../../store/appStore'
import Step1Import from './Step1Import'
import Step2Split from './Step2Split'
import Step3Clean from './Step3Clean'
import Step4Review from './Step4Review'

export default function M1ImportPage() {
  const { modal } = App.useApp()
  const session = useAppStore((s) => s.importSession)
  const setState = useAppStore((s) => s.setState)
  const step = session?.step ?? 0

  const gotoStep = (target: number) => {
    if (!session || target === step) return
    // 回退到导入步 = 重新开始；其余回退仅切换视图，向前由各步按钮推进
    if (target === 0 && step > 0) {
      modal.confirm({
        title: '返回导入步骤？',
        content: '重新导入文件将清空当前切分与清理进度。仅查看请取消。',
        okText: '清空并重新导入',
        onOk: () => setState({ importSession: null }),
      })
      return
    }
    if (target < step) setState({ importSession: { ...session, step: target } })
  }

  return (
    <Card>
      <Steps
        current={step}
        onChange={gotoStep}
        items={[
          { title: '导入文件', description: '编码检测' },
          { title: '章节分割', description: '规则 + AI 兜底' },
          { title: '文本清理', description: 'AI / 规则双路径' },
          { title: '审核与入库', description: '行级 diff 审核' },
        ]}
        style={{ marginBottom: 24 }}
      />
      {step === 0 && <Step1Import />}
      {step === 1 && <Step2Split />}
      {step === 2 && <Step3Clean />}
      {step === 3 && <Step4Review />}
    </Card>
  )
}
