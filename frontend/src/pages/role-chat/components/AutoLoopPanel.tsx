import { Space, Typography, InputNumber, Radio } from 'antd'
import type { RoleChatAutoConfig } from '../../../services/types'

interface Props {
  config: RoleChatAutoConfig
  onConfigChange: (config: RoleChatAutoConfig) => void
}

export default function AutoLoopPanel({ config, onConfigChange }: Props) {
  const updateConfig = (patch: Partial<RoleChatAutoConfig>) => {
    onConfigChange({ ...config, ...patch })
  }

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Typography.Text strong style={{ fontSize: 13 }}>
        自动循环设置
      </Typography.Text>

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
  )
}
