// 节点测试右侧栏「参数设置」面板（A-8 从 index.tsx 抽出，render-only）。
// 图片模式按三协议（modelscope/gpt/xai）分支渲染对应参数；文本模式渲染 temperature/topP/maxTokens。
// 派生标志与表单经 props 传入；token 在组件内自取（不依赖父级，避免 any prop）。
import { Button, Select, Typography, theme } from 'antd'
import type { NodeTestForm } from '../../../store/appStore'
import type { ImageInputMode } from '../../../services/types'
import { RESOLUTIONS, GPT_SIZES } from '../constants'

export default function ParamsPanel(props: {
  isImageMode: boolean
  isModelScope: boolean
  isGpt: boolean
  isXai: boolean
  gptSizeIsCustom: boolean
  supportsEdit: boolean
  isMultimodal: boolean
  busy: boolean
  nodeTestForm: NodeTestForm
  setForm: (patch: Partial<NodeTestForm>) => void
  clearConversation: () => void
}) {
  const { token } = theme.useToken()
  const { isImageMode, isModelScope, isGpt, isXai, gptSizeIsCustom, supportsEdit, isMultimodal, busy, nodeTestForm, setForm, clearConversation } = props
  const modelScopeSizeIsCustom = isModelScope
    && nodeTestForm.resolution !== ''
    && !RESOLUTIONS.some((s) => s.value === nodeTestForm.resolution)

  return (
    <>
      {isImageMode ? (
        <>
          {isModelScope && (
            <div style={{ marginBottom: 16 }}>
              <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>分辨率</Typography.Text>
              <Select
                style={{ width: '100%' }}
                value={modelScopeSizeIsCustom ? '__custom__' : nodeTestForm.resolution}
                onChange={(v) => setForm({ resolution: v === '__custom__' ? '' : v })}
                disabled={busy}
                options={[...RESOLUTIONS, { value: '__custom__', label: '自定义...' }]}
              />
              {(modelScopeSizeIsCustom || nodeTestForm.resolution === '') && (
                <input
                  type="text"
                  value={nodeTestForm.resolution}
                  onChange={(e) => setForm({ resolution: e.target.value })}
                  placeholder="如 512x512"
                  disabled={busy}
                  style={{ width: '100%', marginTop: 8, background: token.colorBgContainer, border: `1px solid ${token.colorBorder}`, borderRadius: 6, padding: 8, color: token.colorText, fontSize: 13 }}
                />
              )}
            </div>
          )}

              {isGpt && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>尺寸</Typography.Text>
                    <Select
                      style={{ width: '100%' }}
                      value={gptSizeIsCustom ? '__custom__' : nodeTestForm.resolution}
                      onChange={(v) => setForm({ resolution: v === '__custom__' ? '' : v })}
                      disabled={busy}
                      options={[...GPT_SIZES, { value: '__custom__', label: '自定义...' }]}
                    />
                    {(gptSizeIsCustom || nodeTestForm.resolution === '') && (
                      <input
                        type="text"
                        value={nodeTestForm.resolution}
                        onChange={(e) => setForm({ resolution: e.target.value })}
                        placeholder="如 1024x1792"
                        disabled={busy}
                        style={{ width: '100%', marginTop: 8, background: token.colorBgContainer, border: `1px solid ${token.colorBorder}`, borderRadius: 6, padding: 8, color: token.colorText, fontSize: 13 }}
                      />
                    )}
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>画质</Typography.Text>
                    <Select
                      style={{ width: '100%' }}
                      value={nodeTestForm.gptQuality ?? ''}
                      onChange={(v) => setForm({ gptQuality: v })}
                      disabled={busy}
                      options={[{ value: '', label: '标准' }, { value: 'high', label: '高清' }]}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>背景</Typography.Text>
                    <Select
                      style={{ width: '100%' }}
                      value={nodeTestForm.gptBackground ?? ''}
                      onChange={(v) => setForm({ gptBackground: v })}
                      disabled={busy}
                      options={[{ value: '', label: '不透明' }, { value: 'transparent', label: '透明' }]}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>审核</Typography.Text>
                    <Select
                      style={{ width: '100%' }}
                      value={nodeTestForm.gptModeration ?? ''}
                      onChange={(v) => setForm({ gptModeration: v })}
                      disabled={busy}
                      options={[{ value: '', label: '自动' }, { value: 'low', label: '宽松' }]}
                    />
                  </div>
                </>
              )}

              {isXai && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>比例</Typography.Text>
                    <Select
                      style={{ width: '100%' }}
                      value={nodeTestForm.xaiAspectRatio ?? '1:1'}
                      onChange={(v) => setForm({ xaiAspectRatio: v })}
                      disabled={busy}
                      options={[
                        { value: '1:1', label: '1:1（方形）' },
                        { value: '3:2', label: '3:2（横图）' },
                        { value: '4:3', label: '4:3（横图）' },
                        { value: '16:9', label: '16:9（横图）' },
                        { value: '21:9', label: '21:9（超宽）' },
                        { value: '9:16', label: '9:16（竖图）' },
                        { value: '2:3', label: '2:3（竖图）' },
                        { value: '3:4', label: '3:4（竖图）' },
                        { value: '2:1', label: '2:1（宽图）' },
                        { value: '1:2', label: '1:2（竖图）' },
                      ]}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>分辨率</Typography.Text>
                    <Select
                      style={{ width: '100%' }}
                      value={nodeTestForm.xaiResolution ?? '2k'}
                      onChange={(v) => setForm({ xaiResolution: v })}
                      disabled={busy}
                      options={[
                        { value: '1k', label: '1K（快速预览）' },
                        { value: '2k', label: '2K（标准）' },
                        { value: '4k', label: '4K（高精）' },
                        { value: '8k', label: '8K（超精）' },
                      ]}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>生成数量</Typography.Text>
                    <input
                      type="number"
                      value={nodeTestForm.xaiN ?? 1}
                      onChange={(e) => {
                        const v = parseInt(e.target.value)
                        if (!isNaN(v) && v >= 1 && v <= 10) setForm({ xaiN: v })
                      }}
                      disabled={busy}
                      min={1}
                      max={10}
                      style={{
                        width: '100%',
                        background: token.colorBgContainer,
                        border: `1px solid ${token.colorBorder}`,
                        borderRadius: 6, padding: 8,
                        color: token.colorText, fontSize: 13,
                      }}
                    />
                  </div>
                </>
              )}

              {isModelScope && (
                <div style={{ marginBottom: 16 }}>
                  <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>反向提示词</Typography.Text>
                  <textarea
                    value={nodeTestForm.negativePrompt ?? ''}
                    onChange={(e) => setForm({ negativePrompt: e.target.value })}
                    placeholder="描述要避免的内容"
                    disabled={busy}
                    rows={3}
                    style={{
                      width: '100%',
                      background: token.colorBgContainer,
                      border: `1px solid ${token.colorBorder}`,
                      borderRadius: 6,
                      padding: 8,
                      color: token.colorText,
                      fontSize: 13,
                      resize: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              )}

              {(isModelScope && (supportsEdit || isMultimodal)) || isGpt || isXai ? (
                <div style={{ marginBottom: 16 }}>
                  <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>图片输入方式</Typography.Text>
                  <Select
                    value={nodeTestForm.imageInputMode || 'base64'}
                    onChange={(mode) => setForm({ imageInputMode: mode as ImageInputMode })}
                    style={{ width: '100%' }}
                  >
                    <Select.Option value="base64">Base64 直传（推荐）</Select.Option>
                    <Select.OptGroup label="临时图床中转（适合大图片）">
                      <Select.Option value="catbox">Catbox（永久保留，≤200MB）</Select.Option>
                      <Select.Option value="litterbox">Litterbox（1-72小时，≤1GB）</Select.Option>
                      <Select.Option value="0x0">0x0.st（约30天，数十MB）</Select.Option>
                      <Select.Option value="telegraph">Telegraph（长期，≤5MB）</Select.Option>
                    </Select.OptGroup>
                  </Select>
                </div>
              ) : null}

              {isModelScope && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>采样步数</Typography.Text>
                    <input
                      type="number"
                      value={nodeTestForm.steps ?? ''}
                      onChange={(e) => setForm({ steps: e.target.value ? parseInt(e.target.value) : undefined })}
                      placeholder="如 9"
                      disabled={busy}
                      min={1}
                      max={100}
                      style={{
                        width: '100%',
                        background: token.colorBgContainer,
                        border: `1px solid ${token.colorBorder}`,
                        borderRadius: 6,
                        padding: 8,
                        color: token.colorText,
                        fontSize: 13,
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>引导系数</Typography.Text>
                    <input
                      type="number"
                      value={nodeTestForm.guidance ?? ''}
                      onChange={(e) => setForm({ guidance: e.target.value ? parseFloat(e.target.value) : undefined })}
                      placeholder="如 4.0"
                      disabled={busy}
                      step={0.5}
                      style={{
                        width: '100%',
                        background: token.colorBgContainer,
                        border: `1px solid ${token.colorBorder}`,
                        borderRadius: 6,
                        padding: 8,
                        color: token.colorText,
                        fontSize: 13,
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>随机种子</Typography.Text>
                    <input
                      type="number"
                      value={nodeTestForm.seed ?? ''}
                      onChange={(e) => setForm({ seed: e.target.value ? parseInt(e.target.value) : undefined })}
                      placeholder="留空=随机"
                      disabled={busy}
                      min={0}
                      style={{
                        width: '100%',
                        background: token.colorBgContainer,
                        border: `1px solid ${token.colorBorder}`,
                        borderRadius: 6,
                        padding: 8,
                        color: token.colorText,
                        fontSize: 13,
                      }}
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>Temperature</Typography.Text>
                <input
                  type="number"
                  value={nodeTestForm.temperature ?? 0.7}
                  onChange={(e) => setForm({ temperature: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="0.7"
                  disabled={busy}
                  min={0}
                  max={2}
                  step={0.1}
                  style={{
                    width: '100%',
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorder}`,
                    borderRadius: 6,
                    padding: 8,
                    color: token.colorText,
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>Top P</Typography.Text>
                <input
                  type="number"
                  value={nodeTestForm.topP ?? 0.9}
                  onChange={(e) => setForm({ topP: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="0.9"
                  disabled={busy}
                  min={0}
                  max={1}
                  step={0.05}
                  style={{
                    width: '100%',
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorder}`,
                    borderRadius: 6,
                    padding: 8,
                    color: token.colorText,
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>Max Tokens</Typography.Text>
                <input
                  type="number"
                  value={nodeTestForm.maxTokens ?? 2000}
                  onChange={(e) => setForm({ maxTokens: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="2000"
                  disabled={busy}
                  min={1}
                  max={100000}
                  style={{
                    width: '100%',
                    background: token.colorBgContainer,
                    border: `1px solid ${token.colorBorder}`,
                    borderRadius: 6,
                    padding: 8,
                    color: token.colorText,
                    fontSize: 13,
                  }}
                />
              </div>

              {isMultimodal && (
                <div style={{ marginBottom: 16 }}>
                  <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>图片输入方式</Typography.Text>
                  <Select
                    value={nodeTestForm.imageInputMode || 'base64'}
                    onChange={(mode) => setForm({ imageInputMode: mode as ImageInputMode })}
                    style={{ width: '100%' }}
                  >
                    <Select.Option value="base64">Base64 直传（推荐）</Select.Option>
                    <Select.OptGroup label="临时图床中转（适合大图片）">
                      <Select.Option value="catbox">Catbox（永久保留，≤200MB）</Select.Option>
                      <Select.Option value="litterbox">Litterbox（1-72小时，≤1GB）</Select.Option>
                      <Select.Option value="0x0">0x0.st（约30天，数十MB）</Select.Option>
                      <Select.Option value="telegraph">Telegraph（长期，≤5MB）</Select.Option>
                    </Select.OptGroup>
                  </Select>
                </div>
              )}

              <Button
                block
                danger
                onClick={clearConversation}
                style={{ marginTop: 16 }}
              >
                清空对话历史
              </Button>
            </>
          )}
      <div style={{ marginTop: 16 }}>
        <Typography.Text style={{ color: token.colorTextSecondary, fontSize: 12, display: 'block', marginBottom: 4 }}>Note</Typography.Text>
        <textarea
          value={nodeTestForm.note ?? ''}
          onChange={(e) => setForm({ note: e.target.value })}
          placeholder="记录灵感、参数说明、使用备注…"
          rows={4}
          style={{
            width: '100%',
            background: token.colorBgContainer,
            border: `1px solid ${token.colorBorder}`,
            borderRadius: 6,
            padding: 8,
            color: token.colorText,
            fontSize: 13,
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </div>
    </>
  )
}
