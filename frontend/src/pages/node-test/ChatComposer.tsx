// 节点测试 · 底部输入区（A-8 从 index.tsx 抽出，render-only）。
// 含：图片预览条 + 底部展开菜单（对比侧选择 / 测试模式 / 分组节点列表）+ 文本输入框 + 发送/取消按钮。
// 所有状态与回调由父级注入；分组数据 groupedProviders 由父级算好传入。
import { Button, Space, Typography, Upload, Segmented, theme } from 'antd'
import { CloseOutlined, MessageOutlined, PictureOutlined, FileImageOutlined, SendOutlined } from '@ant-design/icons'
import type { RefObject } from 'react'
import type { ProviderNode } from '../../services/types'
import type { NodeTestForm } from '../../store/appStore'
import type { TestMode } from './types'

interface ProviderGroup {
  groupName: string
  baseURL: string
  nodes: ProviderNode[]
}

export default function ChatComposer(props: {
  // 图片预览
  showImageInput: boolean
  selectedImages: File[]
  removeImage: (index: number) => void
  // 底部菜单
  bottomMenuOpen: boolean
  setBottomMenuOpen: (v: boolean) => void
  compareMode: boolean
  activeSide: 'left' | 'right'
  setActiveSide: (v: 'left' | 'right') => void
  testMode: TestMode
  onChangeTestMode: (v: TestMode) => void
  // 节点列表
  groupedProviders: Record<string, ProviderGroup>
  availableNodesCount: number
  nodeGroupExpanded: Record<string, boolean>
  toggleGroup: (groupKey: string) => void
  effectiveNodeId: string | undefined
  selectedNodeIdLeft: string | undefined
  selectedNodeIdRight: string | undefined
  onPickNode: (nodeId: string) => void
  // 输入框
  isImageMode: boolean
  isMultimodal: boolean
  supportsEdit: boolean
  selectedNode: ProviderNode | undefined
  nodeTestForm: NodeTestForm
  setForm: (patch: Partial<NodeTestForm>) => void
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  promptRef: RefObject<HTMLTextAreaElement | null>
  handleFileSelect: (file: File) => boolean
  busy: boolean
  handleCancel: () => void
  handleGenerate: () => void
}) {
  const { token } = theme.useToken()
  const {
    showImageInput, selectedImages, removeImage,
    bottomMenuOpen, setBottomMenuOpen, compareMode, activeSide, setActiveSide, testMode, onChangeTestMode,
    groupedProviders, availableNodesCount, nodeGroupExpanded, toggleGroup,
    effectiveNodeId, selectedNodeIdLeft, selectedNodeIdRight, onPickNode,
    isImageMode, isMultimodal, supportsEdit, selectedNode,
    nodeTestForm, setForm, handleKeyDown, promptRef, handleFileSelect, busy, handleCancel, handleGenerate,
  } = props

  return (
    <div style={{ borderTop: `1px solid ${token.colorBorder}`, flexShrink: 0 }}>
      {/* 图片预览区（展示在文本框上方） */}
      {showImageInput && selectedImages.length > 0 && (
        <div style={{ padding: '12px 16px', background: token.colorBgElevated, borderBottom: `1px solid ${token.colorBorder}` }}>
          <Space wrap size={8}>
            {selectedImages.map((file, idx) => {
              const previewUrl = URL.createObjectURL(file)
              return (
                <div key={idx} style={{ position: 'relative' }}>
                  <img
                    src={previewUrl}
                    alt=""
                    style={{ height: 80, maxWidth: 200, objectFit: 'contain', borderRadius: 6, background: token.colorBgElevated }}
                  />
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<CloseOutlined />}
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      background: 'rgba(0,0,0,0.8)',
                      border: 'none',
                      padding: 0,
                      minWidth: 20,
                      height: 20,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff'
                    }}
                    onClick={() => removeImage(idx)}
                  />
                </div>
              )
            })}
          </Space>
        </div>
      )}

      {/* 底部选择菜单（向上展开） */}
      {bottomMenuOpen && (
        <div style={{
          borderTop: `1px solid ${token.colorBorder}`,
          background: token.colorBgElevated,
          maxHeight: 400,
          overflowY: 'auto'
        }}>
          {/* 对比模式：操作侧选择器 */}
          {compareMode && (
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${token.colorBorder}` }}>
              <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 8 }}>操作侧</Typography.Text>
              <Segmented
                block
                value={activeSide}
                onChange={(v) => setActiveSide(v as 'left' | 'right')}
                options={[
                  { label: '左侧', value: 'left' },
                  { label: '右侧', value: 'right' },
                ]}
              />
            </div>
          )}

          {/* 测试模式选择 */}
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${token.colorBorder}` }}>
            <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 8 }}>测试模式</Typography.Text>
            <Segmented
              block
              value={testMode}
              onChange={(v) => onChangeTestMode(v as TestMode)}
              options={[
                { label: '文本推理', value: 'text', icon: <MessageOutlined /> },
                { label: '图片生成', value: 'image', icon: <PictureOutlined /> },
              ]}
            />
          </div>

          {/* 节点列表 */}
          <div style={{ padding: '8px 0', maxHeight: 300, overflowY: 'auto' }}>
            {Object.entries(groupedProviders).map(([groupKey, { groupName, baseURL, nodes }]) => {
              const isExpanded = nodeGroupExpanded[groupKey] ?? true
              return (
                <div key={groupKey} style={{ marginBottom: 4 }}>
                  {/* 分组标题 */}
                  <div
                    style={{
                      padding: '8px 16px',
                      cursor: 'pointer',
                      background: isExpanded ? token.colorFillQuaternary : 'transparent',
                      transition: 'background 0.2s',
                    }}
                    onClick={() => toggleGroup(groupKey)}
                  >
                    <Space size={4}>
                      <Typography.Text style={{ fontSize: 11, color: token.colorTextSecondary }}>
                        {isExpanded ? '▼' : '▶'}
                      </Typography.Text>
                      <Typography.Text strong style={{ fontSize: 13 }}>{groupName}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>({nodes.length})</Typography.Text>
                    </Space>
                    <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2, marginLeft: 12 }}>
                      {baseURL}
                    </Typography.Text>
                  </div>

                  {/* 节点列表 */}
                  {isExpanded && nodes.map((node) => {
                    // 对比模式下根据 activeSide 判断高亮
                    const isSelected = compareMode
                      ? (activeSide === 'left' ? selectedNodeIdLeft === node.id : selectedNodeIdRight === node.id)
                      : effectiveNodeId === node.id
                    return (
                      <div
                        key={node.id}
                        style={{
                          padding: '8px 16px 8px 28px',
                          cursor: 'pointer',
                          background: isSelected ? token.colorPrimaryBg : 'transparent',
                          borderLeft: isSelected ? `3px solid ${token.colorPrimary}` : '3px solid transparent',
                          transition: 'all 0.2s',
                        }}
                        onClick={() => onPickNode(node.id)}
                      >
                        <Typography.Text style={{ fontSize: 13, display: 'block', fontWeight: isSelected ? 500 : 400, color: isSelected ? token.colorPrimary : token.colorText }}>
                          {groupName} · {node.model}
                        </Typography.Text>
                        {node.supportsImageEdit && <Typography.Text type="secondary" style={{ fontSize: 11, marginRight: 4 }}>🖼️ 图生图</Typography.Text>}
                        {node.isMultimodal && <Typography.Text type="secondary" style={{ fontSize: 11 }}>👁️ 多模态</Typography.Text>}
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {availableNodesCount === 0 && (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <Typography.Text type="secondary">无可用节点</Typography.Text>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 输入框区域 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', background: token.colorBgContainer }}>
        {/* 左侧按钮组 */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: `1px solid ${token.colorBorder}` }}>
          {/* 模式/节点选择按钮 */}
          <Button
            icon={<MessageOutlined style={{ fontSize: 16 }} />}
            onClick={() => setBottomMenuOpen(!bottomMenuOpen)}
            style={{
              height: 48,
              width: 48,
              borderRadius: 0,
              border: 'none',
              borderBottom: `1px solid ${token.colorBorder}`,
              background: bottomMenuOpen ? token.colorPrimaryBg : 'transparent',
              color: bottomMenuOpen ? token.colorPrimary : token.colorText,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          />

          {/* 图片上传按钮 */}
          {showImageInput && (
            <Upload
              accept="image/*"
              multiple
              beforeUpload={handleFileSelect}
              showUploadList={false}
            >
              <Button
                icon={<FileImageOutlined style={{ fontSize: 16 }} />}
                style={{
                  height: 48,
                  width: 48,
                  borderRadius: 0,
                  border: 'none',
                  background: 'transparent',
                  color: token.colorText,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              />
            </Upload>
          )}
        </div>

        {/* 文本输入框 */}
        <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
          <textarea
            ref={promptRef}
            value={nodeTestForm.prompt}
            onChange={(e) => setForm({ prompt: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder={
              isImageMode
                ? (supportsEdit && selectedImages.length > 0
                    ? "描述你想对图片做的修改..."
                    : "输入提示词，描述你想要的画面...")
                : (isMultimodal && selectedImages.length > 0
                    ? "描述你的问题（已添加 " + selectedImages.length + " 张图片）..."
                    : isMultimodal
                      ? "输入问题开始对话（支持 Ctrl+V 粘贴图片）..."
                      : "输入问题开始对话（Shift+Enter 发送）...")
            }
            disabled={busy}
            rows={3}
            style={{
              flex: 1,
              background: token.colorBgContainer,
              border: 'none',
              padding: '12px 16px 22px',
              color: token.colorText,
              fontSize: 14,
              resize: 'none',
              fontFamily: 'inherit',
              outline: 'none'
            }}
          />
          {/* 当前选择的节点名（左下角，不拦截输入） */}
          {selectedNode?.name && (
            <Typography.Text
              type="secondary"
              style={{
                position: 'absolute',
                left: 16,
                bottom: 4,
                fontSize: 11,
                opacity: 0.6,
                pointerEvents: 'none',
                maxWidth: 'calc(100% - 32px)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedNode.name}
            </Typography.Text>
          )}
        </div>

        {/* 发送/取消按钮 */}
        {busy ? (
          <Button
            danger
            onClick={handleCancel}
            style={{
              height: 96,
              minWidth: 80,
              borderRadius: 0,
              border: 'none',
              borderLeft: `1px solid ${token.colorBorder}`,
              fontSize: 14
            }}
          >
            取消
          </Button>
        ) : (
          <Button
            type="primary"
            icon={<SendOutlined style={{ fontSize: 18 }} />}
            onClick={handleGenerate}
            disabled={!selectedNode || !nodeTestForm.prompt.trim()}
            style={{
              height: 96,
              minWidth: 80,
              borderRadius: 0,
              background: (!selectedNode || !nodeTestForm.prompt.trim()) ? token.colorBgContainerDisabled : '#FF6B35',
              borderColor: (!selectedNode || !nodeTestForm.prompt.trim()) ? token.colorBorder : '#FF6B35',
              border: 'none',
              borderLeft: `1px solid ${token.colorBorder}`,
              fontSize: 14,
              fontWeight: 500,
              color: '#fff'
            }}
          >
            发送
          </Button>
        )}
      </div>
    </div>
  )
}
