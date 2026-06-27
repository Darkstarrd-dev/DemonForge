import { Button, Modal, Space, Typography } from 'antd'
import type { DecisionRequest, GameState } from '../../game/monopoly/types'

function decisionText(d: DecisionRequest): string {
  if (d.kind === 'buyProperty') {
    return `「${d.context.tileName as string}」目前无人持有，是否买下？`
  }
  if (d.kind === 'upgradeProperty') {
    return `是否将「${d.context.tileName as string}」升级到 ${d.context.nextLevel as number} 级？`
  }
  return '请做出选择'
}

interface Props {
  state: GameState
  interactive: boolean // AI 的决策由自动循环处理，不向 human 弹窗
  onDecide: (optionId: string) => void
}

export default function DecisionModal({ state, interactive, onDecide }: Props) {
  const d = state.awaitingDecision
  const open = state.turn.phase === 'DECIDE' && !!d && interactive

  return (
    <Modal
      open={open}
      title="待决策"
      footer={null}
      closable={false}
      maskClosable={false}
      width={380}
      centered
    >
      {d && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Typography.Text>{decisionText(d)}</Typography.Text>
          <Space>
            {d.options.map((o) => (
              <Button
                key={o.id}
                type={o.id === 'buy' || o.id === 'upgrade' ? 'primary' : 'default'}
                onClick={() => onDecide(o.id)}
              >
                {o.label}
              </Button>
            ))}
          </Space>
        </Space>
      )}
    </Modal>
  )
}
