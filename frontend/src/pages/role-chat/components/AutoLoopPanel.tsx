import { useState } from 'react'
import { Button, Modal, Space, Typography, InputNumber, Radio, theme } from 'antd'
import { QuestionCircleOutlined } from '@ant-design/icons'
import type { RoleChatAutoConfig } from '../../../services/types'

interface Props {
  config: RoleChatAutoConfig
  onConfigChange: (config: RoleChatAutoConfig) => void
}

export default function AutoLoopPanel({ config, onConfigChange }: Props) {
  const { token } = theme.useToken()
  const [helpOpen, setHelpOpen] = useState(false)
  const updateConfig = (patch: Partial<RoleChatAutoConfig>) => {
    onConfigChange({ ...config, ...patch })
  }

  return (
    <>
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Text strong style={{ fontSize: 13 }}>
          自动循环设置
        </Typography.Text>
        <Button type="link" size="small" icon={<QuestionCircleOutlined />} onClick={() => setHelpOpen(true)} style={{ padding: 0, height: 'auto', fontSize: 12 }}>
          说明
        </Button>
      </Space>

      {/* 模式选择 */}
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          循环模式
        </Typography.Text>
        <Radio.Group
          size="small"
          value={config.mode}
          onChange={(e) => updateConfig({ mode: e.target.value })}
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="count">按次数</Radio.Button>
          <Radio.Button value="time">按时间</Radio.Button>
        </Radio.Group>
      </Space>

      {/* 次数/时间设置 */}
      {config.mode === 'count' ? (
        <>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              回复次数
            </Typography.Text>
            <InputNumber
              size="small"
              min={1}
              max={50}
              value={config.count}
              onChange={(v) => updateConfig({ count: v ?? 4 })}
              style={{ width: 80 }}
            />
          </Space>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              波动范围
            </Typography.Text>
            <InputNumber
              size="small"
              min={0}
              max={10}
              value={config.variance}
              onChange={(v) => updateConfig({ variance: v ?? 1 })}
              style={{ width: 80 }}
              addonAfter="±"
            />
          </Space>
        </>
      ) : (
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            运行时长
          </Typography.Text>
          <InputNumber
            size="small"
            min={10}
            max={600}
            value={config.duration}
            onChange={(v) => updateConfig({ duration: v ?? 60 })}
            style={{ width: 80 }}
            addonAfter="秒"
          />
        </Space>
      )}

      {/* 冷却设置 */}
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          冷却时间
        </Typography.Text>
        <InputNumber
          size="small"
          min={0}
          max={30}
          step={0.5}
          value={config.cooldownBase}
          onChange={(v) => updateConfig({ cooldownBase: v ?? 2 })}
          style={{ width: 80 }}
          addonAfter="秒"
        />
      </Space>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          冷却波动
        </Typography.Text>
        <InputNumber
          size="small"
          min={0}
          max={10}
          step={0.5}
          value={config.cooldownVariance}
          onChange={(v) => updateConfig({ cooldownVariance: v ?? 1 })}
          style={{ width: 80 }}
          addonAfter="±秒"
        />
      </Space>

      {/* 反应延迟 */}
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          反应延迟
        </Typography.Text>
        <Space size={4}>
          <InputNumber
            size="small"
            min={0.1}
            max={5}
            step={0.1}
            value={config.reactionDelayMin}
            onChange={(v) => updateConfig({ reactionDelayMin: v ?? 0.5 })}
            style={{ width: 60 }}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            ~
          </Typography.Text>
          <InputNumber
            size="small"
            min={0.1}
            max={10}
            step={0.1}
            value={config.reactionDelayMax}
            onChange={(v) => updateConfig({ reactionDelayMax: v ?? 2 })}
            style={{ width: 60 }}
          />
        </Space>
      </Space>
      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: -4 }}>
        秒（Agent "思考"延迟范围）
      </Typography.Text>
    </Space>

    <Modal
      title="自动循环是如何进行的"
      open={helpOpen}
      onCancel={() => setHelpOpen(false)}
      footer={<Button type="primary" onClick={() => setHelpOpen(false)}>知道了</Button>}
      width={640}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
          启动循环后，<b>每个参与者各自独立、并行</b>地跑下面这个循环，直到达成「收敛条件」才停止。各角色互不等待，发言会交错出现在群聊中。
        </Typography.Paragraph>

        {/* 单次循环流程图 */}
        <div>
          <Typography.Text strong style={{ fontSize: 13 }}>单次循环流程</Typography.Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {[
              { t: '① 反应延迟', s: '开口前等待\nMin~Max 内随机' },
              { t: '② 发言', s: '调用节点\n生成一条回复' },
              { t: '③ 冷却', s: '发言后停顿\n基准±波动 内随机' },
            ].map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ minWidth: 110, background: token.colorFillSecondary, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: token.colorText }}>{b.t}</div>
                  <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 2, whiteSpace: 'pre-line' }}>{b.s}</div>
                </div>
                <span style={{ color: token.colorTextTertiary, fontSize: 16 }}>→</span>
              </div>
            ))}
            <div style={{ minWidth: 110, background: token.colorPrimaryBg, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: token.colorPrimary }}>④ 判断收敛</div>
              <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 2, whiteSpace: 'pre-line' }}>{'未达成 ↺ 回到①\n达成则结束'}</div>
            </div>
          </div>
        </div>

        {/* 参数影响表 */}
        <div>
          <Typography.Text strong style={{ fontSize: 13 }}>各项设置的影响</Typography.Text>
          <div style={{ marginTop: 8, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 8, overflow: 'hidden' }}>
            {[
              ['循环模式', '决定收敛方式：「按次数」凑够发言条数即停；「按时间」到点即停'],
              ['回复次数 count', '（按次数）每个角色的目标发言条数'],
              ['波动范围 ±', '目标条数随机抖动，实际 = count ± 随机(0~波动)，让各角色不整齐划一'],
              ['运行时长', '（按时间）整个循环运行的总秒数'],
              ['冷却时间', '每次发言后的停顿基准，越大节奏越慢、越省 token'],
              ['冷却波动 ±', '冷却时长的随机抖动，实际 = 冷却 ± 随机(0~波动)'],
              ['反应延迟 Min~Max', '每次开口前的思考延迟区间，模拟真人反应、错开各角色发言时机'],
            ].map(([k, v], i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '7px 12px', background: i % 2 ? token.colorFillQuaternary : 'transparent' }}>
                <div style={{ width: 130, flexShrink: 0, fontSize: 12, fontWeight: 600, color: token.colorText }}>{k}</div>
                <div style={{ flex: 1, fontSize: 12, color: token.colorTextSecondary }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </Space>
    </Modal>
    </>
  )
}
