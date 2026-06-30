// 节点池面板 —— Step3Clean 顶部 Collapse 内的节点列表 + 统一设置 + 节点运行参数。
// 接受 nodeRunStates + handlers；不直接读 store（受控模式）。
import { memo } from 'react'
import { Alert, Button, Card, Col, Row, Space, Switch, Typography } from 'antd'
import { EditOutlined, ExperimentOutlined, FileTextOutlined } from '@ant-design/icons'
import type { ResolvedProviderNode } from '../../../services/types'
import type { NodeRuntime } from './hooks/useCleanRun'
import DebouncedInputNumber from './DebouncedInputNumber'

export interface NodePoolPanelProps {
  /** 当前打开/折叠状态 */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 节点运行时状态列表（participating/concurrency/batchChars/intervalSec） */
  nodeRunStates: NodeRuntime[]
  /** 已解析的节点全集（用于显示名称/模型） */
  resolvedNodes: ResolvedProviderNode[]
  /** 正在工作的活跃数（按 nodeName 聚合） */
  activeCountByNodeName: Map<string, number>
  /** 头部按钮回调 */
  onOpenPromptModal: () => void
  onOpenTestTextModal: () => void
  onRunBatchCleanTest: () => void
  batchTesting: boolean
  /** 统一设置（应用全节点） */
  bulkConcurrency: number | null
  setBulkConcurrency: (v: number | null) => void
  bulkBatchChars: number | null
  setBulkBatchChars: (v: number | null) => void
  bulkIntervalSec: number | null
  setBulkIntervalSec: (v: number | null) => void
  onApplyBulk: () => void
  /** 单节点运行时 */
  onToggleParticipating: (nodeId: string, on: boolean) => void
  onUpdateNodeSetting: (nodeId: string, patch: Partial<NodeRuntime>) => void
  /** 运行中标志（影响"统一设置"后是否热更新） */
  running: boolean
  onHotUpdateNodes: () => void
}

function NodePoolPanelInner({
  open,
  onOpenChange,
  nodeRunStates,
  resolvedNodes,
  activeCountByNodeName,
  onOpenPromptModal,
  onOpenTestTextModal,
  onRunBatchCleanTest,
  batchTesting,
  bulkConcurrency,
  setBulkConcurrency,
  bulkBatchChars,
  setBulkBatchChars,
  bulkIntervalSec,
  setBulkIntervalSec,
  onApplyBulk,
  onToggleParticipating,
  onUpdateNodeSetting,
  running,
  onHotUpdateNodes,
}: NodePoolPanelProps) {
  const participatingCount = nodeRunStates.filter((s) => s.participating).length
  return (
    <div data-slot="step3-node-pool" style={{ marginBottom: 16 }}>
      {/* 头部用 Collapse 容器由父级包装；这里只暴露 onOpenChange 由父级管理 open 状态 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          padding: '4px 8px 12px',
        }}
        onClick={() => onOpenChange(!open)}
      >
        <Space>
          <Typography.Text strong>清理节点池</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            （{nodeRunStates.length} 个节点，参选 {participatingCount}）
          </Typography.Text>
        </Space>
        <Space size={4} onClick={(e) => e.stopPropagation()}>
          <Button size="small" icon={<EditOutlined />} onClick={onOpenPromptModal}>
            清理提示词
          </Button>
          <Button size="small" icon={<FileTextOutlined />} onClick={onOpenTestTextModal}>
            测试文本
          </Button>
          <Button
            size="small"
            icon={<ExperimentOutlined />}
            loading={batchTesting}
            disabled={batchTesting || nodeRunStates.length === 0}
            onClick={onRunBatchCleanTest}
          >
            批量测试
          </Button>
        </Space>
      </div>
      {open && (
        <div style={{ padding: '0 8px' }}>
          {nodeRunStates.length === 0 ? (
            <Alert type="warning" showIcon message="无已启用节点，请先到设置页新增并配置节点" />
          ) : (
            <>
              {/* 统一设置所有可用节点的参数 */}
              <Space size={8} align="center" wrap style={{ marginBottom: 12 }}>
                <Typography.Text type="secondary">统一设置所有节点（仅填的生效）：</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  进程
                </Typography.Text>
                <DebouncedInputNumber
                  size="small"
                  min={1}
                  max={32}
                  value={bulkConcurrency}
                  placeholder="如 2"
                  style={{ width: 64 }}
                  onCommit={setBulkConcurrency}
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  字数
                </Typography.Text>
                <DebouncedInputNumber
                  size="small"
                  min={1000}
                  max={100000}
                  step={1000}
                  value={bulkBatchChars}
                  placeholder="如 10000"
                  style={{ width: 72 }}
                  onCommit={setBulkBatchChars}
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  间隔
                </Typography.Text>
                <DebouncedInputNumber
                  size="small"
                  min={0}
                  max={60}
                  value={bulkIntervalSec}
                  placeholder="如 0"
                  style={{ width: 60 }}
                  onCommit={setBulkIntervalSec}
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  s
                </Typography.Text>
                <Button
                  size="small"
                  type="primary"
                  disabled={bulkConcurrency == null && bulkBatchChars == null && bulkIntervalSec == null}
                  onClick={onApplyBulk}
                >
                  统一设置
                </Button>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  应用到全部 {nodeRunStates.length} 个节点，之后仍可逐节点单独调整
                </Typography.Text>
              </Space>
              <Row gutter={[12, 12]}>
                {nodeRunStates.map((rs) => {
                  const p = resolvedNodes.find((x) => x.id === rs.nodeId)
                  const label = p ? `${p.name} · ${p.model || '（未设模型）'}` : rs.nodeId
                  const activeCount = activeCountByNodeName.get(p?.name ?? '') ?? 0
                  return (
                    <Col key={rs.nodeId} xs={24} sm={12} lg={8} xl={6}>
                      <Card
                        size="small"
                        title={
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                            <Switch
                              size="small"
                              checked={rs.participating}
                              onChange={(v) => onToggleParticipating(rs.nodeId, v)}
                            />
                            <Typography.Text ellipsis style={{ flex: 1, minWidth: 0 }}>
                              {label}
                            </Typography.Text>
                          </div>
                        }
                        style={{ borderColor: rs.participating ? '#1677ff' : undefined }}
                      >
                        <Space direction="vertical" size={4} style={{ width: '100%' }}>
                          <Space size={4}>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              进程
                            </Typography.Text>
                            <DebouncedInputNumber
                              size="small"
                              min={1}
                              max={32}
                              value={rs.concurrency}
                              style={{ width: 56 }}
                              onCommit={(v) => {
                                onUpdateNodeSetting(rs.nodeId, { concurrency: v ?? 1 })
                                if (running) setTimeout(onHotUpdateNodes, 0)
                              }}
                            />
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              字数
                            </Typography.Text>
                            <DebouncedInputNumber
                              size="small"
                              min={1000}
                              max={100000}
                              step={1000}
                              value={rs.batchChars}
                              style={{ width: 60 }}
                              onCommit={(v) => {
                                onUpdateNodeSetting(rs.nodeId, { batchChars: v ?? 10000 })
                                if (running) setTimeout(onHotUpdateNodes, 0)
                              }}
                            />
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              间隔
                            </Typography.Text>
                            <DebouncedInputNumber
                              size="small"
                              min={0}
                              max={60}
                              value={rs.intervalSec}
                              style={{ width: 52 }}
                              onCommit={(v) => {
                                onUpdateNodeSetting(rs.nodeId, { intervalSec: v ?? 0 })
                                if (running) setTimeout(onHotUpdateNodes, 0)
                              }}
                            />
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              s
                            </Typography.Text>
                          </Space>
                          {running && rs.participating && (
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              活跃 {activeCount} / {rs.concurrency}
                            </Typography.Text>
                          )}
                        </Space>
                      </Card>
                    </Col>
                  )
                })}
              </Row>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const NodePoolPanel = memo(NodePoolPanelInner)
export default NodePoolPanel
