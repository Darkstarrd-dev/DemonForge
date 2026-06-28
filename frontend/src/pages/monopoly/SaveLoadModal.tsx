import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input, List, Modal, Typography, App } from 'antd'
import type { GameState, GameConfig, SaveGame, SaveMeta } from '../../game/monopoly/types'
import { serializeGame, createSaveStorage } from '../../game/monopoly/engine'
import type { SaveStorage } from '../../game/monopoly/engine'

interface SaveLoadModalProps {
  open: boolean
  mode: 'save' | 'load'
  onClose: () => void
  state: GameState | null
  config: GameConfig | null
  onLoad: (save: SaveGame) => void
}

export default function SaveLoadModal({ open, mode, onClose, state, config, onLoad }: SaveLoadModalProps) {
  const [saves, setSaves] = useState<SaveMeta[]>([])
  const [saveName, setSaveName] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const storageRef = useRef<SaveStorage | null>(null)
  const { message } = App.useApp()

  const refresh = useCallback(async () => {
    try {
      const storage = storageRef.current ?? createSaveStorage()
      storageRef.current = storage
      const list = await storage.list()
      setSaves(list)
    } catch { setSaves([]) }
  }, [])

  useEffect(() => {
    if (open) { refresh(); // eslint-disable-next-line react-hooks/set-state-in-effect -- reset state on modal open is standard pattern
      setSaveName(''); setSelectedId(null) }
  }, [open, refresh])

  const handleSave = async () => {
    if (!state || !config) { message.error('无游戏状态可保存'); return }
    const name = saveName.trim() || `存档 ${new Date().toLocaleString('zh-CN')}`
    setSaving(true)
    try {
      const storage = storageRef.current ?? createSaveStorage()
      const save = serializeGame(state, config, name)
      await storage.put(save)
      message.success('存档成功')
      onClose()
    } catch (err) {
      message.error(`保存失败: ${err}`)
    } finally { setSaving(false) }
  }

  const handleLoad = async () => {
    if (!selectedId) { message.warning('请选择要读取的存档'); return }
    try {
      const storage = storageRef.current ?? createSaveStorage()
      const save = await storage.get(selectedId)
      if (!save) { message.error('存档不存在或已损坏'); return }
      onLoad(save)
      message.success('读档成功')
      onClose()
    } catch (err) {
      message.error(`读档失败: ${err}`)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const storage = storageRef.current ?? createSaveStorage()
      await storage.remove(id)
      setSaves((prev) => prev.filter((s) => s.id !== id))
      if (selectedId === id) setSelectedId(null)
      message.success('已删除')
    } catch (err) {
      message.error(`删除失败: ${err}`)
    }
  }

  return (
    <Modal
      title={mode === 'save' ? '存档' : '读档'}
      open={open}
      onCancel={onClose}
      width={520}
      footer={
        mode === 'save'
          ? [
              <Button key="cancel" onClick={onClose}>取消</Button>,
              <Button key="save" type="primary" loading={saving} onClick={handleSave} disabled={!state}>
                保存
              </Button>,
            ]
          : [
              <Button key="cancel" onClick={onClose}>取消</Button>,
              <Button key="load" type="primary" onClick={handleLoad} disabled={!selectedId}>
                读取
              </Button>,
            ]
      }
    >
      {mode === 'save' && (
        <Input
          placeholder="输入存档名称（留空自动命名）"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          style={{ marginBottom: 16 }}
        />
      )}
      {saves.length === 0 ? (
        <Typography.Text type="secondary">暂无存档</Typography.Text>
      ) : (
        <List
          size="small"
          dataSource={saves}
          renderItem={(item) => (
            <List.Item
              onClick={() => setSelectedId(item.id)}
              style={{
                cursor: 'pointer',
                background: selectedId === item.id ? 'var(--ant-primary-1)' : undefined,
                padding: '8px 12px',
                borderRadius: 6,
              }}
              actions={
                mode === 'load'
                  ? [<Button key="load" size="small" type="link" onClick={() => handleDelete(item.id)}>删除</Button>]
                  : undefined
              }
            >
              <List.Item.Meta
                title={
                  <span style={{ fontSize: 14 }}>
                    {item.name}
                    <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                      {item.status === 'ended' ? '（已结束）' : ''}
                    </Typography.Text>
                  </span>
                }
                description={
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(item.timestamp).toLocaleString('zh-CN')} ｜
                    玩家 {item.playerCount} 人 ｜
                    {item.mapName} ｜
                    第 {item.day} 天
                  </Typography.Text>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Modal>
  )
}
