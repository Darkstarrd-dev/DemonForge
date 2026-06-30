import { useState } from 'react'
import {
  App,
  Button,
  Modal,
  Popconfirm,
  Space,
  Tabs,
  Alert,
  theme,
  Typography,
} from 'antd'
import {
  pushSettingsNow,
  pushStoreNowChecked,
  pushNodePoolNow,
  reloadStoreFromBackend,
  settingsPayload,
  nodePoolPayload,
  useAppStore,
} from '../../store/appStore'
import { nodePoolStore } from '../../packages/node-pool/store'
import type { NodePoolStateCore } from '../../packages/node-pool/types'
import type { ModuleKey } from '../../services/types'
import type { BackupBundle, BundleKind } from '../../utils/backup'
import {
  buildBundle,
  downloadBundle,
  parseBundle,
  readFileAsText,
  summarizeBusiness,
  backupFilename,
} from '../../utils/backup'
import NodesTabContent from './panels/NodesTabContent'
import AdvancedTabContent from './panels/AdvancedTabContent'
import GeneralTabContent from './panels/GeneralTabContent'
import BackupTabContent from './panels/BackupTabContent'

export default function SettingsPage() {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const assetDir = useAppStore((s) => s.assetDir)
  const setState = useAppStore((s) => s.setState)

  const [draftDir, setDraftDir] = useState<string>(assetDir)
  const [applyingDir, setApplyingDir] = useState(false)

  const [exportRedact, setExportRedact] = useState(false)
  const [importPreview, setImportPreview] = useState<{
    bundle: BackupBundle
    warnings: string[]
    filename: string
  } | null>(null)
  const [importBusy, setImportBusy] = useState(false)

  const applyAssetDir = async () => {
    const dir = draftDir.trim()
    setApplyingDir(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetDir: dir }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        message.error(e.error || '资产目录设置失败')
        return
      }
      setState({ assetDir: dir })
      await reloadStoreFromBackend()
      message.success(dir ? `已切换资产目录：${dir}` : '已恢复默认资产目录')
    } finally {
      setApplyingDir(false)
    }
  }

  const handleExport = async (kind: BundleKind) => {
    try {
      let business = null
      if (kind === 'full') {
        const res = await fetch('/api/store')
        if (!res.ok) {
          message.error('读取业务数据失败，无法生成完整备份')
          return
        }
        business = (await res.json()) as Record<string, unknown>
      }
      const st = useAppStore.getState()
      const np = nodePoolPayload()
      const fullSettings = { ...settingsPayload(st), providers: np.providers, providerNodes: np.providerNodes, moduleMapping: np.moduleMapping }
      const bundle = buildBundle(kind, fullSettings, business, exportRedact)
      downloadBundle(bundle, backupFilename(kind, exportRedact))
      message.success(`已导出${kind === 'full' ? '完整备份' : '设置'}（${exportRedact ? '已脱敏 API Key' : '含 API Key'}）`)
    } catch (e) {
      message.error(`导出失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleImportFile = async (file: File) => {
    try {
      const text = await readFileAsText(file)
      const result = parseBundle(text)
      if (result.fatal || !result.bundle) {
        message.error(`无法导入：${result.fatal}`)
        return false
      }
      setImportPreview({ bundle: result.bundle, warnings: result.warnings, filename: file.name })
    } catch (e) {
      message.error(`读取文件失败：${e instanceof Error ? e.message : String(e)}`)
    }
    return false
  }

  const confirmImportSettings = async (bundle: BackupBundle, replaceBusiness: boolean) => {
    setImportBusy(true)
    try {
      const patch: Record<string, unknown> = {}
      const nodePoolPatch: Partial<NodePoolStateCore> = {}
      const s = bundle.settings
      const currentState = useAppStore.getState()
      const currentPool = nodePoolStore.getState()
      const legacy = (s as unknown) as {
        nodeTestGlobalForm?: unknown
        imageDemoGlobalForm?: unknown
        nodeTestFormPerNode?: typeof currentState.nodeTestFormPerNode
        imageDemoFormPerNode?: typeof currentState.nodeTestFormPerNode
        imageDemoForm?: Record<string, unknown>
        theme?: typeof currentState.theme
      }

      if (Array.isArray(s.providers)) {
        const existingProviderIds = new Set(currentPool.providers.map((p) => p.id))
        const providersToAdd = s.providers.filter((p) => !existingProviderIds.has(p.id))
        if (providersToAdd.length > 0) {
          nodePoolPatch.providers = [...currentPool.providers, ...providersToAdd]
        }
      }
      if (Array.isArray(s.providerNodes)) {
        const existingNodeKeys = new Set(
          currentPool.providerNodes.map((n) => `${n.providerId}|||${n.model}`),
        )
        const nodesToAdd = s.providerNodes.filter(
          (n) => !existingNodeKeys.has(`${n.providerId}|||${n.model}`),
        )
        if (nodesToAdd.length > 0) {
          nodePoolPatch.providerNodes = [...currentPool.providerNodes, ...nodesToAdd]
        }
      }

      if (s.moduleMapping) {
        const merged = { ...currentPool.moduleMapping }
        let hasNew = false
        for (const key of Object.keys(s.moduleMapping) as ModuleKey[]) {
          if (!merged[key] || !merged[key].nodeId) {
            merged[key] = s.moduleMapping[key]
            hasNew = true
          }
        }
        if (hasNew) nodePoolPatch.moduleMapping = merged
      }

      if (Array.isArray(s.splitPatterns)) {
        const existingKeys = new Set(currentState.splitPatterns.map((p) => p.key))
        const toAdd = s.splitPatterns.filter((p) => !existingKeys.has(p.key))
        if (toAdd.length > 0) {
          patch.splitPatterns = [...currentState.splitPatterns, ...toAdd]
        }
      }

      if (typeof s.m1SystemPrompt === 'string' && !currentState.m1SystemPrompt) {
        patch.m1SystemPrompt = s.m1SystemPrompt
      }
      if (typeof s.m1TestText === 'string' && !currentState.m1TestText) {
        patch.m1TestText = s.m1TestText
      }
      if (typeof s.m1TitleTemplate === 'string' && currentState.m1TitleTemplate === '第{0n}章 {title}') {
        patch.m1TitleTemplate = s.m1TitleTemplate
      }

      const importGlobal = legacy.nodeTestGlobalForm || legacy.imageDemoGlobalForm
      if (importGlobal && !currentState.nodeTestGlobalForm.nodeId) {
        patch.nodeTestGlobalForm = importGlobal
      }

      const importPerNode = legacy.nodeTestFormPerNode || legacy.imageDemoFormPerNode
      if (importPerNode && typeof importPerNode === 'object') {
        const merged = { ...currentState.nodeTestFormPerNode }
        let hasNew = false
        for (const nodeId of Object.keys(importPerNode)) {
          if (!merged[nodeId]) {
            merged[nodeId] = importPerNode[nodeId]
            hasNew = true
          }
        }
        if (hasNew) patch.nodeTestFormPerNode = merged
      }

      if (legacy.imageDemoForm && !legacy.nodeTestFormPerNode && !legacy.imageDemoFormPerNode) {
        if (!currentState.nodeTestGlobalForm.nodeId) {
          const rawForm = legacy.imageDemoForm as Record<string, unknown>
          const { nodeId, provider, ...params } = rawForm
          patch.nodeTestGlobalForm = { provider: (provider as string) || 'modelscope', nodeId: nodeId as string | undefined }
          if (nodeId && !currentState.nodeTestFormPerNode[nodeId as string]) {
            patch.nodeTestFormPerNode = { ...currentState.nodeTestFormPerNode, [nodeId as string]: params }
          }
        }
      }

      if (s.cleanNodeOverrides && typeof s.cleanNodeOverrides === 'object') {
        const merged = { ...currentState.cleanNodeOverrides }
        let hasNew = false
        for (const nodeId of Object.keys(s.cleanNodeOverrides)) {
          if (!merged[nodeId]) {
            merged[nodeId] = s.cleanNodeOverrides[nodeId]
            hasNew = true
          }
        }
        if (hasNew) patch.cleanNodeOverrides = merged
      }

      if (typeof s.showMenuBar === 'boolean' && currentState.showMenuBar === true) {
        patch.showMenuBar = s.showMenuBar
      }
      if (typeof s.m1AutoRetry === 'boolean' && currentState.m1AutoRetry === true) {
        patch.m1AutoRetry = s.m1AutoRetry
      }
      if (legacy.theme && currentState.theme === 'light') {
        patch.theme = legacy.theme
      }

      if (Object.keys(nodePoolPatch).length) {
        nodePoolStore.setState(nodePoolPatch)
      }
      useAppStore.setState(patch)
      pushSettingsNow()
      pushNodePoolNow()

      if (replaceBusiness && bundle.business) {
        const b = bundle.business
        useAppStore.setState({
          books: b.books ?? [],
          chapters: b.chapters ?? [],
          cards: b.cards ?? [],
          outline: b.outline ?? [],
          scenes: b.scenes ?? [],
          fragments: b.fragments ?? [],
          stateEvents: b.stateEvents ?? [],
          issues: b.issues ?? [],
          architectures: b.architectures ?? [],
          mergeCandidates: b.mergeCandidates ?? [],
          imageGallery: b.imageGallery ?? [],
          chatSessions: b.chatSessions ?? [],
        })
        await pushStoreNowChecked()
      }
      message.success('导入完成')
      setImportPreview(null)
    } catch (e) {
      message.error(`导入失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setImportBusy(false)
    }
  }

  const clearBusinessThenImport = async (bundle: BackupBundle) => {
    setImportBusy(true)
    try {
      const res = await fetch('/api/store', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearAll: true }),
      })
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(e.error || `清空失败 HTTP ${res.status}`)
      }
      await confirmImportSettings(bundle, true)
    } catch (e) {
      message.error(`清空并导入失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setImportBusy(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <Tabs
          defaultActiveKey="nodes"
          style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          tabBarStyle={{ padding: '0 24px', margin: 0, background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorder}` }}
          items={[
            {
              key: 'nodes',
              label: '节点池与测试',
              children: <NodesTabContent />,
            },
            {
              key: 'advanced',
              label: '高级配置',
              children: <AdvancedTabContent
                draftDir={draftDir}
                setDraftDir={setDraftDir}
                assetDir={assetDir}
                applyingDir={applyingDir}
                applyAssetDir={applyAssetDir}
              />,
            },
            {
              key: 'general',
              label: '通用设置',
              children: <GeneralTabContent
                theme={useAppStore((s) => s.theme)}
                setState={setState}
                showMenuBar={useAppStore((s) => s.showMenuBar)}
                pushSettingsNow={pushSettingsNow}
                enable4KScale={useAppStore((s) => s.enable4KScale)}
                scaleBaseWidth={useAppStore((s) => s.scaleBaseWidth)}
              />,
            },
            {
              key: 'backup',
              label: '备份与恢复',
              children: <BackupTabContent
                exportRedact={exportRedact}
                setExportRedact={setExportRedact}
                handleExport={handleExport}
                handleImportFile={handleImportFile}
                importPreview={importPreview}
                setImportPreview={setImportPreview}
                confirmImportSettings={confirmImportSettings}
                clearBusinessThenImport={clearBusinessThenImport}
                importBusy={importBusy}
              />,
            },
          ]}
        />
      </div>

      <Modal
        title={
          importPreview
            ? `${importPreview.bundle.kind === 'full' ? '恢复备份' : '导入设置'} 预览 — ${importPreview.filename}`
            : '导入预览'
        }
        open={!!importPreview}
        onCancel={() => setImportPreview(null)}
        width={Math.min(620, window.innerWidth - 48)}
        destroyOnHidden
        footer={
          importPreview ? (
            <Space>
              <Button onClick={() => setImportPreview(null)}>取消</Button>
              {importPreview.bundle.kind === 'full' ? (
                <>
                  <Popconfirm
                    title="合并导入？"
                    description="将备份中的业务数据追加到当前库，不删除现有数据（syncAll 纯 upsert）。"
                    onConfirm={() => confirmImportSettings(importPreview.bundle, true)}
                    disabled={importBusy}
                  >
                    <Button loading={importBusy}>合并导入</Button>
                  </Popconfirm>
                  <Popconfirm
                    title="先清空再恢复？"
                    description="删除当前库全部业务数据后导入备份内容。此操作不可撤销，请确认！"
                    okText="确认清空并恢复"
                    okButtonProps={{ danger: true }}
                    cancelText="取消"
                    onConfirm={() => clearBusinessThenImport(importPreview.bundle)}
                    disabled={importBusy}
                  >
                    <Button danger loading={importBusy}>
                      先清空再恢复
                    </Button>
                  </Popconfirm>
                </>
              ) : (
                <Button
                  type="primary"
                  loading={importBusy}
                  onClick={() => confirmImportSettings(importPreview.bundle, false)}
                >
                  确认导入设置
                </Button>
              )}
            </Space>
          ) : null
        }
      >
        {importPreview && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Alert
              type="info"
              showIcon
              message={`bundle 版本 v${importPreview.bundle.version}${
                importPreview.bundle.kind === 'full' ? ' · 完整备份' : ' · 仅设置'
              }`}
              description={
                importPreview.bundle.exportedAt
                  ? `导出时间：${importPreview.bundle.exportedAt}`
                  : '无导出时间（可能是旧版裸文件）'
              }
            />
            {importPreview.warnings.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message={`检测到 ${importPreview.warnings.length} 个兼容性提示`}
                description={
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {importPreview.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                }
              />
            )}
            <div>
              <Typography.Text strong>将导入的设置：</Typography.Text>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: 'var(--ant-color-text-secondary)' }}>
                <li>供应商：{importPreview.bundle.settings.providers?.length ?? 0} 个</li>
                <li>节点：{importPreview.bundle.settings.providerNodes?.length ?? 0} 个</li>
                <li>模块映射：{importPreview.bundle.settings.moduleMapping ? Object.keys(importPreview.bundle.settings.moduleMapping).length : 0} 个</li>
                <li>章节检测模式：{importPreview.bundle.settings.splitPatterns?.length ?? 0} 个</li>
                <li>
                  API KEY：
                  {importPreview.bundle.settings.providers?.every((p) => p.apiKeys.every((k) => !k.key))
                    ? '已脱敏（空）'
                    : '含真实值'}
                </li>
              </ul>
            </div>
            {importPreview.bundle.kind === 'full' && importPreview.bundle.business && (
              <div>
                <Typography.Text strong>将导入的业务数据：</Typography.Text>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: 'var(--ant-color-text-secondary)' }}>
                  {Object.entries(summarizeBusiness(importPreview.bundle.business)).map(([k, n]) => (
                    <li key={k}>{k}：{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </Space>
        )}
      </Modal>
    </>
  )
}
