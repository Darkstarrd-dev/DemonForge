import type { SaveGame, SaveMeta } from '../types'
import { extractSaveMeta } from './serializer'

const STORAGE_PREFIX = 'monopoly_save_'
const INDEX_KEY = 'monopoly_save_index'

export interface SaveStorage {
  list(): Promise<SaveMeta[]>
  get(id: string): Promise<SaveGame | null>
  put(save: SaveGame): Promise<void>
  remove(id: string): Promise<void>
}

class ElectronSaveStorage implements SaveStorage {
  async list(): Promise<SaveMeta[]> {
    const api = (window as any).electronAPI
    if (!api?.monopolyListSaves) throw new Error('Electron API 不可用')
    return api.monopolyListSaves()
  }

  async get(id: string): Promise<SaveGame | null> {
    const api = (window as any).electronAPI
    if (!api?.monopolyGetSave) throw new Error('Electron API 不可用')
    return api.monopolyGetSave(id)
  }

  async put(save: SaveGame): Promise<void> {
    const api = (window as any).electronAPI
    if (!api?.monopolyPutSave) throw new Error('Electron API 不可用')
    await api.monopolyPutSave(save)
  }

  async remove(id: string): Promise<void> {
    const api = (window as any).electronAPI
    if (!api?.monopolyDeleteSave) throw new Error('Electron API 不可用')
    await api.monopolyDeleteSave(id)
  }
}

class LocalStorageSaveStorage implements SaveStorage {
  private readIndex(): string[] {
    try {
      const raw = localStorage.getItem(INDEX_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  }

  private writeIndex(ids: string[]): void {
    localStorage.setItem(INDEX_KEY, JSON.stringify(ids))
  }

  async list(): Promise<SaveMeta[]> {
    const ids = this.readIndex()
    const result: SaveMeta[] = []
    for (const id of ids) {
      try {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}${id}`)
        if (raw) {
          const save = JSON.parse(raw) as SaveGame
          result.push(extractSaveMeta(save))
        }
      } catch { /* skip corrupted */ }
    }
    return result.sort((a, b) => b.timestamp - a.timestamp)
  }

  async get(id: string): Promise<SaveGame | null> {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${id}`)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }

  async put(save: SaveGame): Promise<void> {
    localStorage.setItem(`${STORAGE_PREFIX}${save.id}`, JSON.stringify(save))
    const ids = this.readIndex()
    if (!ids.includes(save.id)) {
      ids.push(save.id)
      this.writeIndex(ids)
    }
  }

  async remove(id: string): Promise<void> {
    localStorage.removeItem(`${STORAGE_PREFIX}${id}`)
    const ids = this.readIndex().filter((x) => x !== id)
    this.writeIndex(ids)
  }
}

let _instance: SaveStorage | null = null

export function createSaveStorage(): SaveStorage {
  if (_instance) return _instance
  if (typeof window !== 'undefined' && (window as any).electronAPI?.monopolyListSaves) {
    _instance = new ElectronSaveStorage()
  } else {
    _instance = new LocalStorageSaveStorage()
  }
  return _instance
}
