// 种子数据：演示数据已全部移除（2026-06-20 需求5）
import type {
  Book,
  Chapter,
  EntityCard,
  OutlineNode,
  SimScene,
  SimFragment,
  StateEvent,
  ConsistencyIssue,
  ProviderNode,
  ModuleKey,
  ModuleModelMapping,
  MergeCandidate,
  NovelArchitecture,
} from '../services/types'

export const seedBooks: Book[] = []
export const seedChapters: Chapter[] = []
export const seedOutline: OutlineNode[] = []
export const seedCards: EntityCard[] = []
export const seedMergeCandidates: MergeCandidate[] = []
export const seedScenes: SimScene[] = []
export const seedFragments: SimFragment[] = []
export const seedStateEvents: StateEvent[] = []
export const seedIssues: ConsistencyIssue[] = []

export const seedProviders: ProviderNode[] = [
  {
    id: 'prov-1',
    name: '本地 llama.cpp',
    nodeType: 'text',
    baseURL: 'http://127.0.0.1:8080/v1',
    apiKey: '',
    model: 'qwen3-32b-q4',
    enabled: true,
    lastTestResult: null,
    maxConcurrency: 2,
    batchChars: 10000,
    intervalSec: 1,
  },
  {
    id: 'prov-2',
    name: '云端 API（示例）',
    nodeType: 'text',
    baseURL: 'https://api.example.com/v1',
    apiKey: 'sk-demo-xxxx',
    model: 'demo-large-v2',
    enabled: true,
    lastTestResult: null,
    maxConcurrency: 2,
    batchChars: 10000,
    intervalSec: 0,
  },
]

export const seedModuleMapping: Record<ModuleKey, ModuleModelMapping> = {
  m0Arch: { nodeId: null },
  m0Blueprint: { nodeId: null },
  m1Clean: { nodeId: 'prov-2', model: 'demo-large-v2' },
  m2Extract: { nodeId: 'prov-2', model: 'demo-large-v2' },
  m2CardImage: { nodeId: null },
  m3Simulate: { nodeId: 'prov-2', model: 'demo-large-v2' },
  m4Generate: { nodeId: 'prov-2', model: 'demo-large-v2' },
  m5Check: { nodeId: 'prov-1', model: 'qwen3-32b-q4' },
  m5Finalize: { nodeId: null },
  batchGenerate: { nodeId: null },
  roleChat: { nodeId: null },
  embedding: { nodeId: 'prov-1', model: 'bge-m3' },
}

/** 小说架构种子（地基阶段空，起源流程产出后填充） */
export const seedArchitectures: NovelArchitecture[] = []
