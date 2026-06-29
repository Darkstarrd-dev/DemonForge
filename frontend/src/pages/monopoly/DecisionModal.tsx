import { Button, Modal, Space, Typography, Tag } from 'antd'
import type { DecisionRequest, GameState } from '../../game/monopoly/types'

function decisionText(d: DecisionRequest): string {
  switch (d.kind) {
    case 'buyProperty':
      return `「${d.context.tileName as string}」目前无人持有，是否买下？（¥${d.context.price as number}）`
    case 'upgradeProperty':
      return `是否将「${d.context.tileName as string}」升级到 ${d.context.nextLevel as number} 级？（¥${d.context.cost as number}）`
    case 'payOrMortgage':
      return `现金不足，需支付 ¥${d.context.amount as number}。请选择付款方式`
    case 'jailChoice':
      return '你在监狱中，请选择出狱方式'
    case 'trade':
      return '选择交易对象'
    case 'useCard':
      return '选择要使用的卡片'
    case 'useCardChoice':
      return `使用「${(d.context.cardName as string) ?? '卡片'}」，选择目标`
    case 'useItem':
      return '选择要使用的道具'
    case 'bankOperation':
      return '银行操作'
    case 'stockTrade':
      return '股票交易'
    case 'choosePath':
      return '前方有分叉路，请选择前进方向'
    case 'cardReaction':
      return `「${(d.context.cardName as string) ?? '对手'}」对你使用了卡片，是否使用反制卡？`
    case 'lotteryBet':
      return '是否参与乐透？'
    case 'teleportTarget':
      return '选择传送目的地'
    case 'magicHouseEffect':
      return '魔法屋效果'
    default:
      return '请做出选择'
  }
}

function optionType(kind: DecisionRequest['kind'], optionId: string): 'primary' | 'default' {
  if (kind === 'buyProperty' && optionId === 'buy') return 'primary'
  if (kind === 'upgradeProperty' && optionId === 'upgrade') return 'primary'
  if (kind === 'lotteryBet' && optionId === 'bet') return 'primary'
  return 'default'
}

function isDangerOption(kind: DecisionRequest['kind'], optionId: string): boolean {
  return kind === 'payOrMortgage' && optionId === 'skip'
}

interface Props {
  state: GameState
  interactive: boolean
  onDecide: (optionId: string) => void
}

export default function DecisionModal({ state, interactive, onDecide }: Props) {
  const d = state.awaitingDecision
  const open = !!d && interactive

  return (
    <Modal
      open={open}
      title={
        <span>
          待决策
          <Tag style={{ marginLeft: 8 }}>{String(d?.kind ?? '')}</Tag>
        </span>
      }
      footer={null}
      closable={false}
      maskClosable={false}
      width={420}
      centered
    >
      {d && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Typography.Text>{decisionText(d)}</Typography.Text>
          {d.context.hint != null && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {String(d.context.hint)}
            </Typography.Text>
          )}
          <Space wrap>
            {d.options.map((o) => (
              <Button
                key={o.id}
                type={optionType(d.kind, o.id)}
                danger={isDangerOption(d.kind, o.id)}
                onClick={() => onDecide(o.id)}
              >
                {o.label}
              </Button>
            ))}
          </Space>
          {d.options.some(o => o.preview) && (
            <Space direction="vertical" size={4} style={{ width: '100%', borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
              {d.options.filter(o => o.preview).map(o => (
                <Typography.Text key={o.id} type="secondary" style={{ fontSize: 12 }}>
                  {o.label}：
                  {o.preview!.description ?? (
                    o.preview!.cashDelta !== undefined
                      ? `${o.preview!.cashDelta >= 0 ? '+' : ''}¥${o.preview!.cashDelta}`
                      : ''
                  )}
                </Typography.Text>
              ))}
            </Space>
          )}
        </Space>
      )}
    </Modal>
  )
}