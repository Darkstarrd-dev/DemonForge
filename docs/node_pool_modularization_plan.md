# 节点池模块化方案 (Node Pool Modularization Plan)

| 元信息 | 值 |
|---|---|
| 创建日期 | 2026-06-29 |
| 状态 | 待实施 |
| 范围 | 把节点池/节点功能抽成独立、与其他业务解耦、可复用的模块 |
| 关联文件 | `frontend/src/services/types.ts`、`frontend/src/store/slices/providerSlice.ts`、`frontend/src/pages/settings/panels/NodesTabContent.tsx`、`frontend/src/services/real/{cleanScheduler,batch}.ts`、`frontend/src/utils/providerResolver.ts`、`server/src/routes/settings.ts`、`server/src/store/db.ts` |
| 评分基线 | 17/40 (42.5%) |

---

## 1. 背景与目标

### 1.1 背景

节点池在 `b9e95e7` 提交中刚完成"供应商→节点两层模型"重构,支持多 API KEY 轮询(Round-Robin / Failover)。本次审计发现:重构只完成了**类型层与纯函数策略层**的解耦,后端存储/路由、前端 store/UI、调度器消费接口仍与 novelhelper 业务深度绑定。

### 1.2 目标

把节点池抽成 `packages/node-pool/`(或同等独立模块),达到:

1. **可复用**:任何 Node.js + React 项目可直接引入节点池管理能力
2. **可独立测试**:模块自带单元测试,不依赖 novelhelper 业务数据
3. **可独立导入/导出**:节点池配置可单独备份/迁移,不必整体 settings 备份
4. **接口稳定**:业务调用方依赖抽象接口,节点池内部演进不影响调度器、生成器、role-chat

### 1.3 非目标(明确边界)

- ❌ 不改后端 LLM 客户端接口(`ProviderConfig { baseURL, apiKey, model }` 已最小化,保持不变)
- ❌ 不改 SSE 流式协议
- ❌ 不重写调度器核心算法(只抽公共策略,不改 per-node-per-slot vs pickCandidate 两种模式选择)
- ❌ 不引入新数据库(仍在 SQLite + settings.json 二选一中决策,见 §7 trade-off)

---

## 2. 现状审计

### 2.1 节点池相关文件清单(按层分组)

#### 模型 / 类型层
| 文件 | 角色 |
|---|---|
| `frontend/src/services/types.ts:340-433` | Provider / ProviderNode / ProviderApiKey / ResolvedProviderNode / ProviderNodeType / ImageProtocol / ProviderRotationPolicy / ProviderApiKeyState / ModuleKey / ModuleModelMapping 的**独立、自包含**类型定义(文件共 504 行) |
| `frontend/src/store/types.ts:138-298` | AppState 巨型接口,把 `providers`/`providerNodes`/`moduleMapping` 与 books/chapters 等业务实体**并列**在同一接口 |
| `frontend/src/store/types.ts:31-126` | NodeTestForm / SystemPromptPreset / CleanRunState 等节点测试相关类型 |
| `server/src/llmClient.ts:4-8` | `ProviderConfig { baseURL, apiKey, model }` —— 后端连接级最小接口 |

#### 存储层
| 文件 | 角色 |
|---|---|
| `server/src/store/db.ts:24-41` | ENTITIES 表清单,**无 providers/providerNodes 表**(节点池不入 SQLite) |
| `server/src/routes/settings.ts:7-77` | `settings.json` 读写;节点池数据存于此文件,与 m1SystemPrompt/assetDir/theme 等混存 |
| `frontend/src/store/persistence.ts:157-182` | `settingsPayload` 把 providers/providerNodes/moduleMapping 与其他设置项混合,整体 POST /api/settings |
| `frontend/src/store/bootstrap.ts:45-135` | 启动时从 settings.json 读出 providers/providerNodes,含旧 ProviderNode → 新两层模型迁移 |

#### 路由 / 服务层
| 文件 | 角色 |
|---|---|
| `server/src/routes/settings.ts:79-115` | 仅 `/api/settings`(GET/POST)与 `/api/settings/resolved-paths`,**无 /api/nodes 或 /api/providers 专用路由** |
| `server/src/routes/llm.ts` | /api/llm/{test,clean,embed,chat} 只接收 {baseURL, apiKey, model},不感知节点池 |
| `server/src/routes/creation.*.ts` / `image.ts` / `gptImage.ts` / `xaiImage.ts` | 同上,均从请求体解构连接级参数 |
| `server/src/llmClient.ts` | OpenAI 兼容客户端,无状态、不依赖 ProviderNode |
| `frontend/src/services/real/llm.ts:56-65` | **自定义** `CleanNode` 接口(运行时节点结构,ProviderNode 子集 + name + apiKey) |
| `frontend/src/services/real/batch.ts:20-30` | **自定义** `BatchGenNode` 接口(与 CleanNode 几乎重复) |
| `frontend/src/services/real/generation.ts:24-101` | DraftParams/FinalizeParams/ConsistencyParams 只需 {baseURL, apiKey, model} |

#### 状态 slice 层
| 文件 | 角色 |
|---|---|
| `frontend/src/store/slices/providerSlice.ts:7-90` | 独立 slice:providers/providerNodes/moduleMapping CRUD + consumeProviderUsage 次数扣减 |
| `frontend/src/store/slices/nodeTestSlice.ts:26-134` | 节点测试域(testHistory/chatSessions/sessionRuntimes/systemPromptPresets),与池分离 |
| `frontend/src/store/appStore.ts:15-27` | 组合根,把 6 个 slice spread 进同一个 AppState |

#### 策略 / 纯函数层(已解耦)
| 文件 | 角色 |
|---|---|
| `frontend/src/utils/providerResolver.ts:50-188` | selectApiKey(Round-Robin/Failover)/ markKeyUsed / updateKeyStateByError / resolveProviderNode —— 纯函数 |
| `frontend/src/utils/provider.ts:14-100` | normalizeProvider / normalizeProviderNode / normalizeProviderApiKey —— 纯函数 |
| `frontend/src/utils/nodePicker.ts:19-67` | nodeVendorName / nodeLabel / isMultimodalNode / supportsImageEditNode / groupProviders —— 纯函数 |
| `frontend/src/services/real/circuitBreaker.ts:7-53` | NodeCircuitBreaker 类 —— 纯状态机 |
| `frontend/src/hooks/useModuleNode.ts:36-70` | useModuleNode hook:解析模块默认节点(localOverride → moduleMapping → 兜底) |

#### UI 层
| 文件 | 角色 |
|---|---|
| `frontend/src/pages/settings/panels/NodesTabContent.tsx:42-70` | 节点池管理 Tab,**接收 26 props**(CRUD + 测试 + 模块映射)；M1 提示词/测试文本已迁至 m1-import 模块(2026-06-30) |
| `frontend/src/pages/settings/index.tsx:112-1315` | SettingsPage 1300+ 行巨组件,集中编排所有节点池业务逻辑 |
| `frontend/src/pages/node-test/` | 节点测试独立页面,通过 useModuleNode + nodeTestGlobalForm 选节点 |
| `frontend/src/pages/batch-generate/index.tsx:21-25` | 批量生产页面,自己 resolveProviderNodes 并构造 BatchGenNode[] |
| `frontend/src/pages/book-reader/ImmersiveReader.tsx:418-430` | 单章清理,手工 resolveProviderNode + 构造 CleanNode |

#### 业务调用方
| 文件 | 角色 |
|---|---|
| `frontend/src/services/real/cleanScheduler.ts:48-397` | CleanScheduler 类,per-node-per-slot worker 模式,内嵌可用性检查 + 熔断 |
| `frontend/src/services/real/batch.ts:71-267` | startBatchGenerate,pickCandidate 选择策略,自定义 BatchGenNode |
| `frontend/src/services/sessionEngine.ts:64-120` | 节点测试引擎,接收 ResolvedProviderNode 作为 SendArgs.node |
| `frontend/src/services/roleChatEngine.ts:93-120` | 角色交流引擎,直接 resolveProviderNode 读 store |
| `frontend/src/services/real/cardImage.ts:27-78` | 卡片生图,接收 ResolvedProviderNode 按 protocol 分发 |

#### 配置导入/导出
| 文件 | 角色 |
|---|---|
| `frontend/src/utils/backup.ts:56-146` | SettingsPayload 包含 providers/providerNodes;buildBundle 支持 redactApiKeys;**无法单独导出节点池** |
| `frontend/src/pages/settings/index.tsx:574-761` | handleExport / confirmImportSettings,节点池导入走增量合并 |

### 2.2 评估维度评分

| 维度 | 分数 | 证据 |
|---|---|---|
| **独立数据模型** | **3/5** | `services/types.ts:340-433` 有自包含定义;但全部堆在 504 行 services/types.ts 巨文件里,且 AppState(store/types.ts:138-298)把 providers/providerNodes 与业务实体混在一个 god state 接口 |
| **独立存储层** | **1/5** | `db.ts:24-41` ENTITIES 无 providers/providerNodes 表;节点池存于 settings.json(settings.ts:7-10),与 m1SystemPrompt/assetDir/theme/splitPatterns 等设置项混存;无独立仓储层 |
| **独立服务/路由** | **0/5** | `server/src/routes/` 下无 nodes.ts/providers.ts;节点池 CRUD 全靠前端 zustand → settingsPayload → POST /api/settings 整体写(settings.ts:85-105);后端 LLM 路由只接收 {baseURL,apiKey,model},不感知节点池存在 |
| **独立状态 slice** | **3/5** | `providerSlice.ts:7-90` 是独立 slice,封装了 CRUD + consumeProviderUsage;但通过 `Pick<AppState,...>`(第 7-19 行)从 god state 派生,无法脱离 AppState 使用;持久化路径与其他设置项混合(persistence.ts:157-182) |
| **独立 UI 组件** | **1/5** | `NodesTabContent.tsx:42-70` 接收 26 props,混合节点 CRUD + 测试 + 模块映射(M1 提示词/测试文本已迁出);`SettingsPage index.tsx` 1351 行巨组件集中编排所有节点池业务逻辑(saveProvider/saveNode/testNode/concurrencyTestNode/runBatchTest/startRealTest/fetchModels/batchAddNodes) |
| **选择策略可复用** | **4/5** | providerResolver.ts:50-188 的 selectApiKey/markKeyUsed/updateKeyStateByError/resolveProviderNode 是纯函数;nodePicker.ts/provider.ts/circuitBreaker.ts 均无副作用。扣 1 分:`batch.ts:105-126` 的 pickCandidate 与 `cleanScheduler.ts:262-279` 的可用性检查逻辑(并发/间隔/次数限制)重复,未抽成独立策略函数 |
| **业务调用方依赖反转** | **3/5** | 后端 LLM 客户端只依赖 ProviderConfig(llmClient.ts:4-8)——✅;但前端调度器消费自定义 CleanNode/BatchGenNode(llm.ts:56-65、batch.ts:20-30),调用方需手工映射 ResolvedProviderNode→CleanNode(ImmersiveReader.tsx:427-430);roleChatEngine 直接读 store(第 97 行);调度器通过 isNodeAvailable 回调接收次数限制判定,依赖反转不彻底 |
| **配置导入/导出** | **2/5** | backup.ts:56-72 SettingsPayload 包含 providers/providerNodes;buildBundle 支持 redactApiKeys 脱敏;但**无法单独导出/导入节点池**——只能整体 settings 或 full 备份;导入增量合并逻辑写在 SettingsPage 里(index.tsx:625-642) |

**总分:17/40(42.5%)** —— 节点池处于"类型与纯函数层已独立、状态/UI/存储/路由层深度耦合"的中间状态。

> **审计纠正**:explore 初版报告称 `cleanScheduler.ts:105-126` 与 `batch.ts:105-126` 重复实现 pickCandidate。实际 `cleanScheduler.ts` **没有** pickCandidate 函数(它采用 per-node-per-slot worker 绑定模式,worker 在 `workerLoopForNode:253-324` 内自行检查可用性);只有 `batch.ts:105-126` 有 pickCandidate。两者真正重复的是 `NodeRuntime` 接口(cleanScheduler.ts:23-26 与 batch.ts:59-62 完全相同)与节点可用性检查逻辑(并发/间隔/次数限制)。本方案 §5.3 据此修正。

---

## 3. 核心结论

**节点池目前尚未成为独立、解耦、可复用的模块。** 它呈现出明显的"两极分化":

- **已解耦的部分(可复用)**:
  - 类型定义(services/types.ts:340-428 的 Provider/ProviderNode/ResolvedProviderNode 块)
  - 纯函数工具层(provider.ts / providerResolver.ts / nodePicker.ts / circuitBreaker.ts)已经是无副作用、无框架依赖的独立模块,可直接被任何项目引用
  - 后端 LLM 客户端只依赖 ProviderConfig 最小接口,不感知节点池

- **未解耦的部分(阻碍复用)**:
  1. **后端无专用路由与仓储**:节点池 CRUD 全靠 /api/settings 整体 PATCH,数据混存 settings.json
  2. **前端无独立 store**:providerSlice 通过 Pick<AppState,...> 从 god state 派生,无法脱离 AppState
  3. **UI 严重耦合**:NodesTabContent 26 props 混合 CRUD+测试+模块映射(M1 提示词/测试文本已迁出,但仍属重度耦合);SettingsPage 1351 行巨组件编排所有节点池业务逻辑
  4. **调度器消费接口不统一**:CleanNode / BatchGenNode 重复定义,调用方需手工映射 ResolvedProviderNode
  5. **配置导入/导出无法单独操作节点池**:只能整体 settings 或 full 备份

主要耦合点是 **UI 层**(NodesTabContent + SettingsPage 把节点池管理与测试、模块映射、M1 提示词、测试文本绑死)和 **后端存储层**(无独立 API、无独立表、混存 settings.json)。

---

## 4. 阻碍复用的 TOP 5 耦合点

| 排名 | 耦合点 | file:line 引用 | 说明 |
|---|---|---|---|
| 1 | NodesTabContent 接收 26 props,混合节点 CRUD + 测试 + 模块映射 | `frontend/src/pages/settings/panels/NodesTabContent.tsx:42-70` | 无法独立打包复用;节点池管理与 3 类业务逻辑绑死(M1 提示词/测试文本已迁至 m1-import) |
| 2 | SettingsPage 1300+ 行巨组件,集中编排所有节点池业务逻辑 | `frontend/src/pages/settings/index.tsx:112-1315` | saveProvider/saveNode/testNode/concurrencyTestNode/runBatchTest/startRealTest/fetchModels/batchAddNodes/confirmImportSettings 全写在此文件,节点池逻辑没有自己的组件/hook 边界 |
| 3 | 后端无 providers/providerNodes 表与专用路由 | `server/src/store/db.ts:24-41` + `server/src/routes/settings.ts:79-115` | 节点池数据混存 settings.json,CRUD 靠整体 POST /api/settings,无独立 API;后端无法独立提供节点池服务 |
| 4 | settingsPayload 把 providers/providerNodes 与其他设置项混合;providerSlice 从 god state 派生 | `frontend/src/store/persistence.ts:157-182` + `frontend/src/store/slices/providerSlice.ts:7-19` | 持久化路径与其他设置项混合;slice 通过 Pick<AppState,...> 派生,无法脱离 AppState 独立使用 |
| 5 | 调度器消费自定义 CleanNode/BatchGenNode 而非节点池抽象;NodeRuntime 接口与可用性检查两处重复 | `frontend/src/services/real/llm.ts:56-65` + `batch.ts:20-30,59-62,105-126` + `cleanScheduler.ts:23-26,262-279` | 调用方需手工映射 ResolvedProviderNode→CleanNode(ImmersiveReader.tsx:427-430);两套调度器各维护一套运行态 |

---

## 5. 实施方案 5.1-5.7

按"成本低→高"排序,前 3 项是零/小成本搬迁,后 4 项需要实质性重构。**强烈建议按 5.1→5.7 顺序执行,每步独立可验证、可回滚。**

### 5.1 类型独立(零成本)

**目标**:把节点池类型抽到独立文件,原位置 re-export 保持向后兼容。

**改动文件**:
- 新增:`frontend/src/packages/node-pool/types.ts`
- 修改:`frontend/src/services/types.ts`(删除 340-433 行块,改为 re-export)

**代码 sketch**:

```ts
// frontend/src/packages/node-pool/types.ts
export type ProviderNodeType = 'text' | 'image'
export type ImageProtocol = 'modelscope' | 'gpt' | 'xai'
export type ProviderApiKeyState = 'ok' | 'exhausted' | 'disabled'
export type ProviderRotationPolicy = 'round-robin' | 'failover'

export interface ProviderApiKey { /* ... 原样搬迁 ... */ }
export interface Provider { /* ... */ }
export interface ProviderNode { /* ... */ }
export interface ResolvedProviderNode extends ProviderNode { /* ... */ }
export type ModuleKey = /* ... */
export interface ModuleModelMapping { /* ... */ }
```

```ts
// frontend/src/services/types.ts(替换 340-433 行)
export type {
  ProviderNodeType, ImageProtocol, ProviderApiKeyState, ProviderRotationPolicy,
  Provider, ProviderApiKey, ProviderNode, ResolvedProviderNode,
  ModuleKey, ModuleModelMapping,
} from '../packages/node-pool/types'
```

**依赖**:无

**验证点**:
- `bun run typecheck`(frontend)通过
- `bun run lint` 通过
- 设置页节点池 Tab 正常渲染(零行为变化)

**回滚策略**:`git revert` 单次提交。无数据迁移,无破坏性。

**成本估计**:0.5 人时。

---

### 5.2 纯函数层独立(零成本)

**目标**:把已无副作用的纯函数/纯类整块迁入 `packages/node-pool/`。

**改动文件**:
- 新增:
  - `frontend/src/packages/node-pool/normalize.ts`(从 `frontend/src/utils/provider.ts` 迁入)
  - `frontend/src/packages/node-pool/resolver.ts`(从 `frontend/src/utils/providerResolver.ts` 迁入)
  - `frontend/src/packages/node-pool/picker.ts`(从 `frontend/src/utils/nodePicker.ts` 迁入)
  - `frontend/src/packages/node-pool/circuitBreaker.ts`(从 `frontend/src/services/real/circuitBreaker.ts` 迁入)
- 修改:原 4 个文件改为 re-export

**代码 sketch**(以 resolver 为例):

```ts
// frontend/src/packages/node-pool/resolver.ts
import type { Provider, ProviderApiKey, ProviderNode, ResolvedProviderNode } from './types'

export interface ResolverState {
  providers: Provider[]
  providerNodes: ProviderNode[]
}

export function selectApiKey(provider: Provider): { key: ProviderApiKey; keyId: string } | null {
  /* ... 原样搬迁 ... */
}

export function resolveProviderNode(state: ResolverState, nodeId: string): ResolvedProviderNode | null {
  /* ... */
}
```

**依赖**:5.1 完成(类型已独立)。

**验证点**:
- 现有 `circuitBreaker.test.ts`、`persistence.test.ts` 全部通过
- 节点测试、单章清理、批量生成端到端跑通

**回滚策略**:`git revert`。无数据迁移。

**成本估计**:1 人时(主要是路径调整 + re-export)。

---

### 5.3 调度策略抽出(小成本)

**目标**:消除 cleanScheduler / batch 两套调度器的重复部分,抽公共策略函数。

**纠正说明**:初版报告称两处重复 `pickCandidate`,实际只有 `batch.ts:105-126` 有 pickCandidate;`cleanScheduler.ts` 用 per-node-per-slot 模式,worker 在 `workerLoopForNode:253-324` 自检可用性。两者真正重复的是:
1. `NodeRuntime` 接口(`cleanScheduler.ts:23-26` 与 `batch.ts:59-62` 字段完全相同)
2. 节点可用性检查逻辑(并发 / 间隔 / 次数限制)

**改动文件**:
- 新增:
  - `frontend/src/packages/node-pool/runtime.ts` —— `NodeRuntime` 接口 + `NodeRuntimeMap` 类型
  - `frontend/src/packages/node-pool/policy.ts` —— `isNodeAvailableNow(cfg, state, opts)` / `pickLeastLoadedNode(nodeConfigs, states, opts)`
- 修改:
  - `frontend/src/services/real/cleanScheduler.ts` —— 删除本地 `NodeRuntime`,改 import;`workerLoopForNode` 内可用性检查调用 `isNodeAvailableNow`
  - `frontend/src/services/real/batch.ts` —— 删除本地 `NodeRuntime` 与 `pickCandidate`,改调用 `pickLeastLoadedNode`
  - `frontend/src/services/real/llm.ts:56-65` —— `CleanNode` 改为 `ResolvedProviderNode` 的别名或子集,消除重复定义
  - `frontend/src/services/real/batch.ts:20-30` —— `BatchGenNode` 同上

**代码 sketch**:

```ts
// frontend/src/packages/node-pool/runtime.ts
export interface NodeRuntime {
  activeCount: number
  lastRequestTime: number
}
export type NodeRuntimeMap = Map<string, NodeRuntime>
```

```ts
// frontend/src/packages/node-pool/policy.ts
import type { NodeRuntime, NodeRuntimeMap } from './runtime'

export interface NodeConfigBase {
  id: string
  maxConcurrency: number
  intervalSec: number
}

export interface AvailabilityOpts {
  now: number
  isExternalAvailable?: (nodeId: string) => boolean
}

/** 检查节点当前是否可接受新请求(并发未满 + 间隔已过 + 外部次数未耗尽) */
export function isNodeAvailableNow<C extends NodeConfigBase>(
  cfg: C, state: NodeRuntime | undefined, opts: AvailabilityOpts,
): boolean {
  if (!state) return false
  if (state.activeCount >= cfg.maxConcurrency) return false
  const intervalMs = cfg.intervalSec * 1000
  if (intervalMs > 0 && opts.now - state.lastRequestTime < intervalMs) return false
  if (opts.isExternalAvailable && !opts.isExternalAvailable(cfg.id)) return false
  return true
}

/** batch 调度器专用:从所有节点中选"最久未用→最少连接" */
export function pickLeastLoadedNode<C extends NodeConfigBase>(
  nodeConfigs: C[], states: NodeRuntimeMap, opts: AvailabilityOpts,
): { cfg: C; state: NodeRuntime } | null {
  const candidates: { cfg: C; state: NodeRuntime }[] = []
  for (const cfg of nodeConfigs) {
    const state = states.get(cfg.id)
    if (!state) continue
    if (!isNodeAvailableNow(cfg, state, opts)) continue
    candidates.push({ cfg, state })
  }
  if (!candidates.length) return null
  candidates.sort((a, b) => {
    const timeDiff = a.state.lastRequestTime - b.state.lastRequestTime
    if (timeDiff !== 0) return timeDiff
    return a.state.activeCount - b.state.activeCount
  })
  return candidates[0]
}
```

**统一调度消费接口**(消除 CleanNode / BatchGenNode 重复):

```ts
// frontend/src/packages/node-pool/types.ts(追加)
/** 调度器消费的运行时节点视图——ResolvedProviderNode 的调度子集 */
export interface SchedulableNode {
  id: string
  name: string
  baseURL: string
  apiKey: string
  model: string
  maxConcurrency: number
  intervalSec: number
  /** 批次字数上限(仅文本清理节点用;图片节点/批量生成无此字段)。可选以兼容 BatchGenNode */
  batchChars?: number
}
```

```ts
// frontend/src/services/real/llm.ts
export type CleanNode = SchedulableNode  // 别名,向后兼容
```

**依赖**:5.1、5.2 完成。

**验证点**:
- `cleanScheduler.test.ts`(若存在)、`dequeue.test.ts` 通过
- M1 章节清理 E2E 跑通(单章 + 批量 + 暂停/停止 + 自动重试 + 模型切换)
- 批量章节生成 E2E 跑通(draft→finalize 串行 + 失败即停)
- 单章清理(ImmersiveReader.tsx)正常

**回滚策略**:`git revert`。无数据迁移。需重点回归调度器所有路径。

**成本估计**:4 人时(含回归测试)。

**Trade-off**:
- ✅ 消除重复定义,后续策略演进(如加权轮询)只改一处
- ✅ 调度器消费 `SchedulableNode` 后,ImmersiveReader 不再需手工映射 ResolvedProviderNode→CleanNode
- ⚠️ `cleanScheduler.ts` 的 per-node-per-slot 模式不直接用 `pickLeastLoadedNode`,但通过 `isNodeAvailableNow` 仍能复用核心逻辑
  - ⚠️ `SchedulableNode` 引入后需注意字段对齐:CleanNode 含 `batchChars`(必填,llm.ts:63),BatchGenNode **无**此字段(batch.ts:20-30);方案已把 SchedulableNode.batchChars 设为可选,CleanNode 保留为 `SchedulableNode & { batchChars: number }` 的具名别名,BatchGenNode 直接 = SchedulableNode。ResolvedProviderNode 含 batchChars(继承自 ProviderNode)→ 满足 CleanNode,ImmersiveReader 无需手工映射

---

### 5.4 状态 slice 解耦(中成本)

**目标**:把 providerSlice 从 `Pick<AppState,...>` 派生改为独立 store,可脱离 AppState 使用。

**改动文件**:
- 新增:
  - `frontend/src/packages/node-pool/store.ts` —— `NodePoolState` 接口 + `createNodePoolStore()` 工厂
  - `frontend/src/packages/node-pool/persistence.ts` —— `serializeNodePool(state)` / `hydrateNodePool(raw)` 独立序列化
- 修改:
  - `frontend/src/store/slices/providerSlice.ts` —— 改为薄封装,委托给 `createNodePoolStore()`
  - `frontend/src/store/persistence.ts:157-182` —— `settingsPayload` 中节点池部分改调 `serializeNodePool`
  - `frontend/src/store/bootstrap.ts:45-135` —— 启动 hydrate 改调 `hydrateNodePool`
  - `frontend/src/store/appStore.ts:15-27` —— 节点池 slice 通过 interop 层接入 AppState(保持现有 API 兼容)

**代码 sketch**:

```ts
// frontend/src/packages/node-pool/store.ts
import { createStore, type StoreApi } from 'zustand'
import type { Provider, ProviderNode, ModuleKey, ModuleModelMapping } from './types'

export interface NodePoolState {
  providers: Provider[]
  providerNodes: ProviderNode[]
  moduleMapping: Record<ModuleKey, ModuleModelMapping>
  addProvider: (p: Provider) => void
  updateProvider: (p: Provider) => void
  removeProvider: (id: string) => void
  addProviderNode: (n: ProviderNode) => void
  updateProviderNode: (n: ProviderNode) => void
  removeProviderNode: (id: string) => void
  consumeProviderUsage: (nodeId: string) => boolean
}

export function createNodePoolStore(initial?: Partial<NodePoolState>): StoreApi<NodePoolState> {
  return createStore<NodePoolState>((set, get) => ({
    providers: initial?.providers ?? [],
    providerNodes: initial?.providerNodes ?? [],
    moduleMapping: initial?.moduleMapping ?? {},
    /* ... CRUD 实现,从 providerSlice.ts 原样搬迁 ... */
  }))
}
```

```ts
// frontend/src/store/slices/providerSlice.ts(改为 interop)
import { createNodePoolStore, type NodePoolState } from '../../packages/node-pool/store'

// 单例节点池 store(独立于 AppState 存在)
export const nodePoolStore = createNodePoolStore()

// AppState 上的薄封装:把调用委托给 nodePoolStore
export const createProviderSlice: StateCreator<AppState, [], [], ProviderSlice> = (set, get) => ({
  get providers() { return nodePoolStore.getState().providers },
  /* ... 其他 getter 委托 ... */
  addProvider: (p) => nodePoolStore.getState().addProvider(p),
  /* ... */
})
```

**依赖**:5.1、5.2、5.3 完成。

**验证点**:
- `persistence.test.ts`、`appStore.test.ts` 通过
- 节点池 Tab CRUD 操作(增删改查、模块映射、次数扣减)正常
- 跨页面(设置页 → 节点测试 → 批量生成 → 单章清理)节点池状态一致

**回滚策略**:`git revert`。**需备份 settings.json**——若新版 hydrate 有 bug 可能导致节点池数据丢失,有 .bak 兜底(settings.ts:57-72 已有原子写)。

**成本估计**:8 人时(含 interop 层 + 回归)。

**Trade-off**:
- ✅ 节点池 store 可被任何项目独立引入
- ✅ 持久化路径独立,可单独 pushNodePoolNow()
- ⚠️ AppState 上的 getter 委托有性能开销(每次访问调 `nodePoolStore.getState()`),对热点路径(如 cleanScheduler worker 循环每 50ms 读节点)需注意——可在 interop 层做快照缓存
- ⚠️ interop 层增加复杂度;若彻底废除 AppState 上的 providers/providerNodes 字段,则需改所有调用方(本次不做,保留 interop 渐进迁移)

---

### 5.5 后端独立路由 + 仓储(中成本)

**目标**:后端提供专用 `/api/providers`、`/api/nodes` CRUD。

> **2026-06-30 决策**:采用两步走——**5.5a**(本轮实施):加路由但仍读写 settings.json 的 providers/providerNodes 键,零迁移风险;**5.5b**(独立排期,本轮不做):数据从 settings.json 迁到 SQLite 独立表。本节代码 sketch 为 5.5b 终态,5.5a 仅实现 routes 部分、repository 退化为读写 settings.json 两键。

#### 5.5a 过渡方案(本轮实施)

**目标**:后端提供专用 `/api/providers`、`/api/nodes` CRUD 路由,数据仍存 settings.json 的两键,零迁移风险。

**改动文件**:
- 新增:
  - `server/src/routes/nodes.ts` —— providers/nodes CRUD 路由(薄层,委托 repository)
  - `server/src/store/nodePoolRepository.ts` —— **接口 + SettingsJsonRepo 实现**
- 修改:
  - `server/src/index.ts` —— 注册 nodesRoutes
  - `frontend/src/services/api.ts` —— 新增 `providers.list/create/update/remove`、`nodes.list/create/update/remove` 方法
  - `frontend/src/services/real/llm.ts` 等调用方 —— 仍读前端 store,但 store 启动时从 /api/providers 拉取而非 settings.json
  - `server/src/routes/settings.ts` —— POST /api/settings 不再接受 providers/providerNodes 键(改由 nodes 路由管理;过渡期可仍兼容,但标记 deprecated)

**验证点(5.5a)**:
- 后端单元测试:`nodesRoutes` CRUD 全覆盖(经 SettingsJsonRepo)
- 前端:启动后节点池 Tab 数据正常显示(来源切换为 /api/providers)
- 设置页整体 POST /api/settings 不再包含 providers/providerNodes
- 并发写:两个标签页同时改不同节点,settings.json 原子写(三步写+.bak)不丢数据

**成本估计**:6 人时(5.5a)。

---

#### 前瞻约束:Repository 接口隔离契约

> **5.5a 实施时必须遵守此契约**,否则 5.5b 需返工路由层。

5.5a 的 repository 必须以**接口**形式定义,SettingsJsonRepo 只是其中一个实现。5.5b 时新增 SqliteRepo 实现类,路由层零改动。

```ts
// server/src/store/nodePoolRepository.ts

/** 节点池仓储接口——5.5a/5.5b 共用,路由层只依赖此接口 */
export interface NodePoolRepository {
  listProviders(): Provider[]
  getProvider(id: string): Provider | null
  saveProvider(p: Provider): void       // upsert
  deleteProvider(id: string): void      // 级联删其下节点
  listNodes(): ProviderNode[]
  getNode(id: string): ProviderNode | null
  saveNode(n: ProviderNode): void       // upsert
  deleteNode(id: string): void
}

/** 5.5a 实现:读写 settings.json 的 providers/providerNodes 两键 */
export class SettingsJsonRepo implements NodePoolRepository {
  // 读:readSettings()['providers'] ?? []
  // 写:readSettings() → 改两键 → writeSettings(原子三步写)
  // 级联删:deleteProvider 时同时过滤掉 providerId 匹配的 nodes
  // ...
}

/** 5.5b 实现(独立排期):读写 SQLite 两张表 */
// export class SqliteRepo implements NodePoolRepository { ... }
```

```ts
// server/src/routes/nodes.ts(5.5a/5.5b 路由层完全相同)
import type { NodePoolRepository } from '../store/nodePoolRepository'

// repo 实例由 index.ts 注入(5.5a 注入 SettingsJsonRepo,5.5b 注入 SqliteRepo)
export function nodesRoutes(app: FastifyInstance, repo: NodePoolRepository) {
  app.get('/api/providers', () => repo.listProviders())
  app.post('/api/providers', (req) => { repo.saveProvider(req.body as Provider); return { ok: true } })
  app.put('/api/providers/:id', (req) => { repo.saveProvider(req.body as Provider); return { ok: true } })
  app.delete('/api/providers/:id', (req) => { repo.deleteProvider((req.params as { id: string }).id); return { ok: true } })
  app.get('/api/nodes', () => repo.listNodes())
  app.post('/api/nodes', (req) => { repo.saveNode(req.body as ProviderNode); return { ok: true } })
  app.put('/api/nodes/:id', (req) => { repo.saveNode(req.body as ProviderNode); return { ok: true } })
  app.delete('/api/nodes/:id', (req) => { repo.deleteNode((req.params as { id: string }).id); return { ok: true } })
}
```

```ts
// server/src/index.ts(注入点——5.5a 与 5.5b 仅此一行不同)
import { SettingsJsonRepo } from './store/nodePoolRepository'
// 5.5b 时改为: import { SqliteRepo } from './store/nodePoolRepository'
const nodePoolRepo = new SettingsJsonRepo()
await nodesRoutes(app, nodePoolRepo)
```

**契约约束**:
- 路由层**只依赖** `NodePoolRepository` 接口,禁止直接 import `SettingsJsonRepo`/`SqliteRepo` 具体类
- 接口方法签名一旦定下,5.5b 不得修改(只新增实现类)
- 如 5.5b 需要新能力(如批量查询),接口加方法,SettingsJsonRepo 也得实现(宁可 unused 也要有)

---

#### 5.5b 终态设计草案(独立排期,本轮仅落地草案)

> **何时启动 5.5b 详细设计**:5.5a 实施完成 + 跑通端到端回归后。基于 SettingsJsonRepo 的真实实现暴露的痛点(并发瓶颈/字段演进痛点)再决定是否值得迁 SQLite。

**目标**:`SqliteRepo` 实现 `NodePoolRepository` 接口,数据从 settings.json 迁到 SQLite 两表,路由层零改动。

**表结构 DDL 草案**(符合 db.ts 文档式模式):

> **设计决策**:沿用 db.ts 现有模式——`(id TEXT PRIMARY KEY, data TEXT)` 整实体存 JSON,字段演进无需迁移。**不**用关系型分列表(原方案的关系型 DDL 已废弃,因 db.ts 设计哲学是文档式,且节点池数据量小——几十个节点,无需关系型索引)。

```sql
-- 沿用 db.ts ENTITIES 文档式模式,与 books/chapters/cards 等表结构一致
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL  -- Provider 整体 JSON 序列化(含 apiKeys[])
);

CREATE TABLE IF NOT EXISTS provider_nodes (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL  -- ProviderNode 整体 JSON 序列化
);
```

```ts
// server/src/store/db.ts(ENTITIES 数组追加两项,与现有模式一致)
const ENTITIES = [
  { key: 'books', table: 'books' },
  // ... 现有 11 项 ...
  { key: 'providers', table: 'providers' },         // 5.5b 新增
  { key: 'providerNodes', table: 'provider_nodes' }, // 5.5b 新增
] as const
```

> **备选方案(5.5b 设计时再决策)**:若需按 providerId 查询节点或外键级联,可改关系型分列表。但 db.ts 现有 11 张表全是文档式,破例引入关系型表会增加 repository 实现复杂度。建议保持文档式,级联删除在 SqliteRepo 内部用 `data JSON 解析 → 过滤 providerId` 实现(数据量小,性能可接受)。

**迁移脚本要点**(5.5b 实施时细化):
- 启动时检测 settings.json 是否含 `providers` 键;有则灌入新表,然后**从 settings.json 删除该键**(写回)
- 迁移前自动备份 settings.json 为 `settings.json.pre-migrate.bak`
- 迁移失败不删原键,下次启动重试
- SqliteRepo 与 SettingsJsonRepo 可通过环境变量切换(过渡期保留 1-2 个版本,如 `NODE_POOL_REPO=sqlite|settings`)

**验证点(5.5b)**:
- 造一份含 providers 的旧 settings.json,启动后确认数据进入 SQLite,settings.json 不再含 providers 键
- SqliteRepo 单元测试:CRUD + 级联删除(删 provider 时其下 nodes 一并删)
- 路由层零改动(仍是 5.5a 的 nodesRoutes,只换注入的 repo 实例)

**回滚策略(5.5b)**:
- `settings.json.pre-migrate.bak` 恢复
- 环境变量 `NODE_POOL_REPO=settings` 退回 SettingsJsonRepo
- 数据库新表可直接 drop(不影响旧表)

**成本估计(5.5b)**:12 人时(SqliteRepo 实现 + 迁移脚本 + 回归)。

**Trade-off(5.5b 关键决策点)**:
- ✅ SQLite 事务性优于 settings.json 整体写,并发安全
- ✅ 节点池与业务实体统一存储层(db.ts),不再混存 settings.json
- ⚠️ **重大破坏性变更**:迁移失败可能丢节点池数据,需充分测试 + 多重备份
- ⚠️ 文档式表无法用 SQL 索引单字段(如按 providerId 查 nodes),但数据量小可接受
- ✅ **接口隔离保证**:5.5b 只新增 SqliteRepo,路由层零改动,风险被隔离在 repository 层内

**依赖**:5.5a 完成 + 5.4 完成(前端 store 已独立,只需改 hydrate 来源)。

---

### 5.6 UI 组件拆分(高成本但机械)

**目标**:把 NodesTabContent 拆为 3 个职责单一的子组件,把 SettingsPage 的节点池业务逻辑抽到独立 hooks。

> **2026-06-30 修正**:M1 提示词/测试文本已从 NodesTabContent 迁至 m1-import 模块(Step3Clean),故原方案的 M1PromptPanel/TestTextPanel 两个子组件不再需要,拆分目标从 5 个子组件收敛为 3 个。

**改动文件**:
- 新增:
  - `frontend/src/packages/node-pool/ui/NodePoolManager.tsx` —— 纯 CRUD(只接收 providers/providerNodes/onCrud)
  - `frontend/src/packages/node-pool/ui/NodeTestPanel.tsx` —— 测试入口
  - `frontend/src/packages/node-pool/ui/ModuleMappingPanel.tsx` —— 模块映射
  - `frontend/src/hooks/useNodePoolCrud.ts` —— saveProvider/saveNode/duplicateNode/moveNode/reorderProviders/reorderNodes
  - `frontend/src/hooks/useNodeTesting.ts` —— testNode/concurrencyTestNode/runBatchTest/startRealTest/fetchModels/batchAddNodes
- 修改:
  - `frontend/src/pages/settings/panels/NodesTabContent.tsx` —— 改为组合 3 个子组件,props 从 26 降到 ~8
  - `frontend/src/pages/settings/index.tsx:112-1351` —— 节点池逻辑调用 hooks,SettingsPage 体积减半

**代码 sketch**(NodePoolManager):

```tsx
// frontend/src/packages/node-pool/ui/NodePoolManager.tsx
export interface NodePoolManagerProps {
  providers: Provider[]
  providerNodes: ProviderNode[]
  resolvedNodes: ResolvedProviderNode[]
  nodeTypeFilter: ProviderNodeType
  onNodeTypeFilterChange: (v: ProviderNodeType) => void
  onAddProvider: () => void
  onEditProvider: (p: Provider) => void
  onAddNodeForProvider: (providerId: string) => void
  onEditNode: (node: ProviderNode, provider: Provider) => void
  onRemoveProvider: (id: string) => void
  onRemoveNode: (id: string) => void
  onToggleNodeEnabled: (node: ProviderNode, enabled: boolean) => void
  onMoveNode: (nodeId: string, dir: -1 | 1) => void
  onDuplicateNode: (node: ProviderNode) => void
  nodeGroupExpanded: Record<string, boolean>
  onToggleGroup: (key: string) => void
  // 测试入口通过 children 注入,保持 Manager 纯 CRUD
  children?: React.ReactNode
}
```

**依赖**:5.4 完成(store 独立,UI 可独立打包)。

**验证点**:
- 节点池 Tab 视觉与交互零变化(截图对比)
- 每个子组件可独立 mount 渲染(Storybook 或单测)
- `useNodePoolCrud` / `useNodeTesting` 单元测试通过

**回滚策略**:`git revert`。无数据迁移。

**成本估计**:12 人时(UI 拆分机械但量大,含回归;较原估 16 人时下降,因子组件从 5 个减为 3 个)。

**Trade-off**:
- ✅ NodePoolManager 可独立打包复用
- ✅ SettingsPage 减负,可维护性大幅提升
- ⚠️ 26 props 拆到 3 个子组件后,组合层(props 传递)可能更复杂——建议配 context 或 hooks 减少透传

---

### 5.7 导入/导出独立(小成本)

**目标**:支持单独导出/导入节点池配置,不必整体 settings 备份。

**改动文件**:
- 修改:`frontend/src/utils/backup.ts` —— 新增 `buildNodePoolBundle(state, { redact })` / `parseNodePoolBundle(raw)`
- 修改:`frontend/src/pages/settings/index.tsx:574-761` —— 节点池 Tab 增加"导出节点池" / "导入节点池"按钮
- 新增:`frontend/src/packages/node-pool/serialize.ts` —— 独立序列化(供 backup.ts 与 5.4 persistence 共用)

**代码 sketch**:

```ts
// frontend/src/packages/node-pool/serialize.ts
import type { Provider, ProviderNode, ModuleKey, ModuleModelMapping } from './types'
import { normalizeProvider, normalizeProviderNode } from './normalize'

export interface NodePoolBundle {
  version: 1
  providers: Provider[]
  providerNodes: ProviderNode[]
  moduleMapping: Record<ModuleKey, ModuleModelMapping>
}

export function serializeNodePool(state: NodePoolState, opts: { redact?: boolean } = {}): NodePoolBundle {
  return {
    version: 1,
    providers: state.providers.map((p) => opts.redact ? redactProvider(p) : normalizeProvider(p)),
    providerNodes: state.providerNodes.map(normalizeProviderNode),
    moduleMapping: state.moduleMapping,
  }
}

export function hydrateNodePoolBundle(raw: unknown): NodePoolBundle {
  // 校验 + 默认值 + 旧版本迁移
}

function redactProvider(p: Provider): Provider {
  return { ...p, apiKeys: p.apiKeys.map((k) => ({ ...k, key: k.key.slice(0, 4) + '****' })) }
}
```

**依赖**:5.1、5.2 完成(类型与 normalize 已独立)。

**验证点**:
- 导出节点池 → JSON 文件 → 导入另一实例,节点池完整还原
- 脱敏模式:apiKeys.key 显示 `sk-1****`
- 与整体 settings 备份兼容(整体备份仍包含节点池,不冲突)

**回滚策略**:`git revert`。无数据迁移。

**成本估计**:3 人时。

---

## 6. Trade-off 分析(跨阶段)

### 6.1 monorepo vs 单项目内子目录

| 方案 | 优势 | 劣势 |
|---|---|---|
| `packages/node-pool/`(monorepo 风格) | 真正独立,可单独发布 npm | 需引入 workspace 配置(pnpm workspace / turbo),构建复杂度上升 |
| `frontend/src/packages/node-pool/`(单项目子目录) | 零构建配置改动,路径相对引用 | 仍嵌在 frontend,不能被其他项目直接 npm install |

**建议**:先做单项目子目录(`frontend/src/packages/node-pool/`),验证解耦完整后再升级为 monorepo 包。本次方案 §5 全部基于子目录路径,后续升级为 monorepo 仅需改 import 路径。

### 6.2 SQLite vs settings.json(§5.5 决策)

| 方案 | 优势 | 劣势 |
|---|---|---|
| 迁 SQLite(§5.5 主方案) | 事务性、并发安全、可独立查询 | 迁移风险大、破坏性变更 |
| 仅加路由仍存 settings.json(过渡方案) | 零迁移风险、立即获得独立 API | 失去事务性、后端仍混存 |

**建议**:5.5 拆两步执行:5.5a 加 `/api/providers`、`/api/nodes` 路由但仍读写 settings.json 的 providers/providerNodes 键(过渡);5.5b 后续再迁 SQLite(可独立排期)。本次方案文档不强制 5.5b 时机。

### 6.3 interop 保留 vs 彻底废除 AppState 节点池字段(§5.4 决策)

| 方案 | 优势 | 劣势 |
|---|---|---|
| interop 层(§5.4 主方案) | 调用方零改动,渐进迁移 | 双层状态、性能开销 |
| 彻底废除 AppState.providers/providerNodes | 单一数据源、性能最优 | 需改所有 `useAppState(s => s.providers)` 调用方,改动量大 |

**建议**:5.4 用 interop 层;后续在 5.6 UI 拆分时,新组件直接用 `nodePoolStore`,旧组件逐步迁移,最终废除 interop。

---

## 7. 与其他模块联动影响评估

### 7.1 调度器(cleanScheduler / batch)

- **影响**:5.3 抽出 `isNodeAvailableNow` / `pickLeastLoadedNode` 后,两个调度器各删 ~15 行本地实现
- **风险**:`cleanScheduler` 的 per-node-per-slot 模式与 `batch` 的 pickCandidate 模式本质不同,5.3 只复用"可用性检查",不改"选节点策略",风险可控
- **回归重点**:M1 自动重试(autoRetry)、模型切换(switchBatchNode)、节点热更新(hotUpdateNodes)、节点熔断

### 7.2 role-chat 引擎

- **影响**:`roleChatEngine.ts:93-120` 直接 `resolveProviderNode` 读 store;5.4 后 store 独立,需改 import 路径
- **风险**:零(纯 import 路径变更)
- **回归重点**:角色对话流式输出、模型切换

### 7.3 卡片生图(cardImage)

- **影响**:`cardImage.ts:27-78` 接收 ResolvedProviderNode 按 protocol 分发(modelscope/gpt/xai);5.1 类型独立后,protocol 类型从 node-pool 导出,无逻辑变化
- **风险**:零
- **回归重点**:三种协议的生图流程

### 7.4 节点测试(node-test)

- **影响**:`nodeTestSlice.ts` 与 providerSlice 已分离,5.4 不影响;`sessionEngine.ts` 接收 ResolvedProviderNode,5.1 后类型从 node-pool 导出
- **风险**:零
- **回归重点**:文本/多模态/图片三种测试、对话记录、System Instructions 预设

### 7.5 单章清理(ImmersiveReader)

- **影响**:`ImmersiveReader.tsx:418-430` 手工 `resolveProviderNode` + 构造 CleanNode;5.3 引入 `SchedulableNode` 后,ResolvedProviderNode 直接满足接口,无需手工映射
- **风险**:低(字段对齐即可)
- **回归重点**:单章清理流式 + DiffView + 接受覆盖

### 7.6 批量生成(batch-generate)

- **影响**:`batch-generate/index.tsx:21-25` 自己 resolveProviderNodes 并构造 BatchGenNode[];5.3 后 BatchGenNode = SchedulableNode,ResolvedProviderNode 直接满足
- **风险**:低
- **回归重点**:draft→finalize 串行、失败即停、节点热更新

### 7.7 设置页其他 Tab

- **影响**:GeneralTabContent / AdvancedTabContent / BackupTabContent 与节点池无耦合,5.x 不影响
- **风险**:零

### 7.8 备份/恢复(backup)

- **影响**:5.7 增加 `buildNodePoolBundle` 独立导出;整体 settings 备份仍包含节点池,兼容
- **风险**:零(纯增量)
- **回归重点**:整体备份/恢复、节点池单独导出/导入、脱敏

---

## 8. 风险与回滚矩阵

| 阶段 | 主要风险 | 回滚策略 | 数据影响 |
|---|---|---|---|
| 5.1 | 类型 re-export 路径错误 | git revert | 无 |
| 5.2 | 纯函数搬迁后循环依赖 | git revert | 无 |
| 5.3 | 调度器行为微变(可用性检查边界条件) | git revert + 调度器 E2E 回归 | 无 |
| 5.4 | interop 层性能问题 / hydrate bug | git revert + settings.json.bak 恢复 | 低(有 .bak) |
| 5.5a | 路由层 bug(过渡方案) | 退回读 settings.json | 无 |
| 5.5b | **迁移脚本丢数据** | settings.json.pre-migrate.bak 恢复 | **高**(需充分测试) |
| 5.6 | UI 拆分后 props 透传断裂 | git revert | 无 |
| 5.7 | 导入/导出格式不兼容 | 旧版本 backup 仍可用 | 无 |

---

## 9. 验收清单(模块化完成后的可复用性测试)

- [ ] `frontend/src/packages/node-pool/` 可被独立 import,不依赖 novelhelper 任何业务代码
- [ ] `frontend/src/packages/node-pool/types.ts` 类型定义自包含
- [ ] `frontend/src/packages/node-pool/{resolver,normalize,picker,circuitBreaker}.ts` 为纯函数/纯类,无副作用
- [ ] `frontend/src/packages/node-pool/policy.ts` 的 `isNodeAvailableNow` / `pickLeastLoadedNode` 有单元测试覆盖
- [ ] `frontend/src/packages/node-pool/store.ts` 的 `createNodePoolStore()` 可独立 createStore
- [ ] `frontend/src/packages/node-pool/ui/NodePoolManager.tsx` 可独立 mount,接收 props 渲染
- [ ] `frontend/src/packages/node-pool/serialize.ts` 的 `serializeNodePool` / `hydrateNodePoolBundle` 有单元测试
- [ ] 后端 `/api/providers`、`/api/nodes` CRUD 路由独立可用(5.5a 完成后)
- [ ] 调度器消费 `SchedulableNode` 接口,不再自定义 CleanNode/BatchGenNode
- [ ] 节点池可单独导出/导入(不依赖整体 settings 备份)
- [ ] 所有现有 E2E 路径(M1 清理、批量生成、单章清理、role-chat、节点测试、卡片生图)零行为变化

---

## 10. 不在本次范围

- ❌ 不改后端 LLM 客户端接口(`ProviderConfig { baseURL, apiKey, model }`)
- ❌ 不改 SSE 流式协议
- ❌ 不重写调度器核心算法(per-node-per-slot vs pickCandidate 模式选择保持不变)
- ❌ 不强制升级为 monorepo(先做单项目子目录,后续再议)
- ❌ 不强制迁 SQLite(5.5a 过渡方案优先,5.5b 独立排期)
- ❌ 不改 node-test 模块(已与 providerSlice 解耦)
- ❌ 不改 role-chat / cardImage 业务逻辑(只改 import 路径)

---

## 11. 实施顺序与依赖图

```
5.1 类型独立 (零成本)
   ↓
5.2 纯函数层独立 (零成本)
   ↓
5.3 调度策略抽出 (小成本)  ←─── 依赖 5.1+5.2
   ↓
5.4 状态 slice 解耦 (中成本)  ←─── 依赖 5.1+5.2 (5.3 可并行)
   ↓
5.5a 后端独立路由(过渡) (小成本)  ←─── 依赖 5.4
   ↓ (可选,独立排期)
5.5b 迁 SQLite (中成本)
   ↓
5.6 UI 组件拆分 (高成本)  ←─── 依赖 5.4
   ↓
5.7 导入/导出独立 (小成本)  ←─── 依赖 5.1+5.2 (可早期并行)
```

**建议实施批次**:
- **批次 1(零成本,可一次提交)**:5.1 + 5.2 + 5.7
- **批次 2(小成本)**:5.3
- **批次 3(中成本)**:5.4
- **批次 4(小成本过渡)**:5.5a
- **批次 5(高成本)**:5.6
- **批次 6(可选,独立排期)**:5.5b

**总成本估计**:40.5 人时(不含 5.5b)/ 52.5 人时(含 5.5b)
> 2026-06-30 修正:5.6 因 M1PromptPanel/TestTextPanel 已迁出、子组件从 5 个减为 3 个,成本从 16 降至 12 人时;总分相应从 44.5 降至 40.5。

---

## 12. 历史纠正记录

| 日期 | 纠正项 |
|---|---|
| 2026-06-29 | explore 初版报告称 `cleanScheduler.ts:105-126` 与 `batch.ts:105-126` 重复 pickCandidate。实际 cleanScheduler 无 pickCandidate(采用 per-node-per-slot worker 模式),worker 在 `workerLoopForNode:253-324` 内自检可用性。两者真正重复的是 `NodeRuntime` 接口与可用性检查逻辑。§5.3 已据此修正。 |
| 2026-06-30 | 核对方案保存后的变更:① NodesTabContent 的 M1 提示词/测试文本已迁至 m1-import 模块(Step3Clean),props 从 30+ 降至 26,行号 `:14-63` → `:42-70`;§2.1/§2.2/§3/§4 已修正,§5.6 子组件从 5 个收敛为 3 个(M1PromptPanel/TestTextPanel 不再需要),成本 16→12 人时。② services/types.ts 实际 504 行(非 550),节点池类型范围 `:340-433`(非 `:340-428`)。③ §5.3 SchedulableNode 原称"字段实际一致,风险低"——实际 CleanNode 含 `batchChars`(必填)而 BatchGenNode 无此字段;已把 SchedulableNode.batchChars 设为可选并补充字段对齐说明。④ 全文路径统一为 `frontend/src/packages/node-pool/`(子目录方案),re-export 相对路径相应修正。⑤ §5.5 标注 5.5a(过渡,本轮)/5.5b(迁 SQLite,独立排期)两步走决策。 |
| 2026-06-30 | §5.5 重构:拆为 5.5a(过渡方案)+ 前瞻约束(Repository 接口隔离契约)+ 5.5b(终态设计草案)三部分。新增 `NodePoolRepository` 接口 + `SettingsJsonRepo`/`SqliteRepo` 双实现设计——路由层只依赖接口、接收 repo 注入,5.5b 时只换注入实例、路由层零改动。表结构 DDL 从关系型分列表改为文档式 `(id TEXT PRIMARY KEY, data TEXT)`(符合 db.ts 现有 11 张表统一模式);原关系型 DDL 已废弃。§13 批次 4/6 核对清单同步更新。 |

---

## 13. 实施前核对清单(Pre-implementation Checklist)

> 本节为下次动手前的逐项核对表。每项标注【已核实】= 本轮已确认现状吻合;【待实施】= 动手时需执行。按批次 1→6 顺序排列。

### 批次 1:5.1 类型独立 + 5.2 纯函数层独立 + 5.7 导入/导出独立

#### 5.1 类型独立
- 【已核实】`frontend/src/services/types.ts:340-433` 含 Provider/ProviderApiKey/Provider/ProviderNode/ResolvedProviderNode/ProviderNodeType/ImageProtocol/ProviderRotationPolicy/ProviderApiKeyState/ModuleKey/ModuleModelMapping,均自包含
- 【已核实】`getModuleNodeType` 函数(types.ts:343-345)夹在类型定义之间——搬迁时需决定:随类型一起迁入 node-pool,还是留在 services/types.ts(它依赖 ModuleKey,建议随迁)
- 【待实施】新建 `frontend/src/packages/node-pool/types.ts`,原样搬迁上述类型
- 【待实施】`frontend/src/services/types.ts` 删除 340-433 行块,改为 `export type { ... } from '../packages/node-pool/types'`
- 【待实施】`bun run typecheck`(frontend)通过;设置页节点池 Tab 渲染零变化

#### 5.2 纯函数层独立
- 【已核实】`frontend/src/utils/providerResolver.ts` 共 188 行,selectApiKey/markKeyUsed/updateKeyStateByError/resolveProviderNode/resolveAndUseProviderNode 均为纯函数,无副作用
- 【已核实】`frontend/src/utils/provider.ts` 含 normalizeProvider/normalizeProviderNode/normalizeProviderApiKey(方案称 :14-100)
- 【已核实】`frontend/src/utils/nodePicker.ts` 含 nodeVendorName/nodeLabel/isMultimodalNode/supportsImageEditNode/groupProviders(方案称 :19-67)
- 【已核实】`frontend/src/services/real/circuitBreaker.ts` 含 NodeCircuitBreaker 类(方案称 :7-53)
- 【待实施】4 个文件分别迁入 `frontend/src/packages/node-pool/{normalize,resolver,picker,circuitBreaker}.ts`,原文件改 re-export
- 【待实施】确认 `circuitBreaker.test.ts` 等现有测试 import 路径是否需调整(re-export 应让旧路径继续工作)
- 【待实施】回归:节点测试、单章清理、批量生成端到端

#### 5.7 导入/导出独立
- 【已核实】`frontend/src/utils/backup.ts` SettingsPayload 含 providers/providerNodes(方案称 :56-146),buildBundle 支持 redactApiKeys
- 【已核实】`frontend/src/pages/settings/index.tsx` handleExport/confirmImportSettings 在 :574-761 附近(方案行号,1351 行文件)
- 【待实施】新建 `frontend/src/packages/node-pool/serialize.ts`,实现 serializeNodePool/hydrateNodePoolBundle
- 【待实施】`backup.ts` 新增 buildNodePoolBundle/parseNodePoolBundle,委托 serialize.ts
- 【待实施】节点池 Tab 增加"导出节点池"/"导入节点池"按钮
- 【待实施】验证:导出 → JSON → 导入另一实例完整还原;脱敏模式 apiKey 显示 `sk-1****`

### 批次 2:5.3 调度策略抽出

- 【已核实】`cleanScheduler.ts:23-26` NodeRuntime = `{ activeCount: number; lastRequestTime: number }`
- 【已核实】`batch.ts:59-62` NodeRuntime 字段完全相同(重复定义)
- 【已核实】`batch.ts:105-126` pickCandidate 逻辑:并发未满+间隔已过+外部可用,排序最久未用→最少连接
- 【已核实】`cleanScheduler.ts` 无 pickCandidate,用 per-node-per-slot worker 模式,worker 在 workerLoopForNode 内自检
- 【已核实】`llm.ts:56-65` CleanNode **含 batchChars(必填)**
- 【已核实】`batch.ts:20-30` BatchGenNode **无 batchChars**
- 【已核实】`ImmersiveReader.tsx:418-430` 手工 resolveProviderNode + 构造 CleanNode(maxConcurrency:1, batchChars:999999, intervalSec:0)
- 【待实施】新建 `runtime.ts`(NodeRuntime+NodeRuntimeMap)、`policy.ts`(isNodeAvailableNow+pickLeastLoadedNode)
- 【待实施】SchedulableNode 接口加 `batchChars?: number`(可选,覆盖 CleanNode 独有字段)
- 【待实施】CleanNode 改为 `SchedulableNode & { batchChars: number }` 别名;BatchGenNode = SchedulableNode 别名
- 【待实施】cleanScheduler 删本地 NodeRuntime,改 import;workerLoopForNode 可用性检查调 isNodeAvailableNow
- 【待实施】batch.ts 删本地 NodeRuntime + pickCandidate,改调 pickLeastLoadedNode
- 【待实施】ImmersiveReader 不再手工构造 CleanNode,ResolvedProviderNode 直接满足(注意 maxConcurrency/batchChars/intervalSec 的单章清理特化值 1/999999/0 如何注入——可能仍需一个薄适配层,不能完全消除手工映射)
- 【待实施】回归:M1 自动重试、模型切换、节点热更新、熔断;批量 draft→finalize 串行失败即停

### 批次 3:5.4 状态 slice 解耦

- 【已核实】`providerSlice.ts:7-19` 通过 `Pick<AppState, ...>` 从 god state 派生
- 【已核实】`persistence.ts:157-182` settingsPayload 把 providers/providerNodes/moduleMapping 与 20+ 设置项混存
- 【已核实】`bootstrap.ts` 启动时从 settings.json 读 providers/providerNodes,含旧 ProviderNode→新两层模型迁移(方案称 :45-135)
- 【待实施】新建 `store.ts`(createNodePoolStore 工厂)、`persistence.ts`(serializeNodePool/hydrateNodePool 独立序列化,与 5.7 serialize.ts 共用)
- 【待实施】providerSlice 改为 interop 薄封装,委托 nodePoolStore
- 【待实施】settingsPayload 节点池部分改调 serializeNodePool
- 【待实施】bootstrap hydrate 改调 hydrateNodePool
- 【待实施】**备份 settings.json** 再动手(hydrate bug 可能丢节点池数据)
- 【待实施】回归:persistence.test.ts、appStore.test.ts;节点池 Tab CRUD;跨页面状态一致

### 批次 4:5.5a 后端独立路由(过渡)

- 【已核实】`server/src/routes/settings.ts:79-115` 仅 /api/settings + /api/settings/resolved-paths,无 /api/nodes 或 /api/providers
- 【已核实】`server/src/store/db.ts:24-41` ENTITIES 数组无 providers/providerNodes 表
- 【已核实】`server/src/llmClient.ts` ProviderConfig {baseURL, apiKey, model} 最小接口,不感知节点池
- 【待实施】新建 `server/src/store/nodePoolRepository.ts`:定义 **NodePoolRepository 接口** + **SettingsJsonRepo 实现**(读写 settings.json 两键)
- 【待实施】新建 `server/src/routes/nodes.ts`:8 个 CRUD 端点,路由层**只依赖接口**、接收 repo 注入
- 【待实施】`server/src/index.ts` 注入 `new SettingsJsonRepo()` 给 nodesRoutes
- 【待实施】`frontend/src/services/api.ts` 新增 providers/nodes CRUD 方法
- 【待实施】前端 store 启动时从 /api/providers 拉取(替代 settings.json 直读)
- 【待实施】`settings.ts` POST /api/settings 拒收/忽略 providers/providerNodes 键(改由 nodes 路由)
- 【待实施】验证:整体 POST /api/settings 不再含 providers/providerNodes;节点池 Tab 数据正常;并发写不丢数据
- **前瞻约束**:路由层禁止 import 具体 Repo 类,只依赖 NodePoolRepository 接口(5.5b 时只换注入实例)

### 批次 5:5.6 UI 组件拆分

- 【已核实】`NodesTabContent.tsx:42-70` interface 26 props(CRUD+测试+模块映射),M1 提示词/测试文本已迁出
- 【已核实】`settings/index.tsx` 1351 行,集中编排 saveProvider/saveNode/testNode/concurrencyTestNode/runBatchTest/startRealTest/fetchModels/batchAddNodes
- 【待实施】新建 3 个子组件(非 5 个):NodePoolManager(纯 CRUD) + NodeTestPanel(测试) + ModuleMappingPanel(映射)
- 【待实施】新建 2 个 hooks:useNodePoolCrud + useNodeTesting
- 【待实施】NodesTabContent 改为组合 3 子组件,props 26→~8
- 【待实施】SettingsPage 调用 hooks,体积减半
- 【待实施】回归:节点池 Tab 视觉与交互零变化(截图对比)

### 批次 6(可选,独立排期):5.5b 迁 SQLite

> **启动前置**:5.5a 跑通端到端回归后,基于 SettingsJsonRepo 真实实现暴露的痛点再决定是否启动。

- 【待实施】db.ts ENTITIES 追加 `{ key: 'providers', table: 'providers' }` + `{ key: 'providerNodes', table: 'provider_nodes' }`(文档式:`id TEXT PRIMARY KEY, data TEXT`)
- 【待实施】新建 `SqliteRepo implements NodePoolRepository`(接口已由 5.5a 定义,本轮只新增实现类)
- 【待实施】`index.ts` 注入点改为 `new SqliteRepo()`(路由层零改动)
- 【待实施】迁移脚本:settings.json 两键 → SQLite 两表,迁移前自动备份 `settings.json.pre-migrate.bak`,失败不删原键
- 【待实施】环境变量 `NODE_POOL_REPO=sqlite|settings` 过渡期切换
- 【待实施】风险高:需充分测试 + 多重备份;级联删除在 SqliteRepo 内部用 JSON 解析+过滤实现(数据量小)

---

## 14. 本轮已确认的 3 个潜在陷阱(实施时重点盯防)

1. **5.3 ImmersiveReader 不能完全消除手工映射**:单章清理需 maxConcurrency:1/batchChars:999999/intervalSec:0 的特化值,ResolvedProviderNode 的真实节点配置不满足。方案称"无需手工映射"过于乐观——实际需保留一个薄适配函数(如 `toSingleNodeClean(node): SchedulableNode`),不能直接传 ResolvedProviderNode。
2. **5.4 interop 性能**:cleanScheduler worker 循环每 50ms 读节点,若每次都走 `nodePoolStore.getState()` getter 委托,可能有性能开销。interop 层需做快照缓存或在调度器启动时一次性取节点引用。
3. **5.7 与 5.4 的 serialize.ts 共用**:5.7 先实施时 serialize.ts 只服务 backup;5.4 后实施时 persistence.ts 也要调它。注意 5.7 的 NodePoolBundle(version 字段)与 5.4 的 hydrateNodePool(无 version,直接灌 store)接口需统一,避免两套序列化逻辑。

---

## 15. 核心业务跑通路线图(Use Case Flow)

> 挑选 2 个最典型场景,用大白话描述新架构下的调用顺序。一个简单(单章清理,展示 ResolvedProviderNode→SchedulableNode 的简化)、一个复杂(批量章节生成,展示 pickLeastLoadedNode + NodeRuntime 状态流转)。

### 场景 1:单章清理(ImmersiveReader,简单路径)

**前置**:用户在书库→全屏阅读页,选中一章,从下拉选了一个文本节点,点「开始清理」。

**运作流程**:

1. **UI 触发**:`ImmersiveReader.tsx` 的 `startClean()` 被调用,拿到 `selectedNodeId`(用户选的节点 id)
2. **解析节点**:调 `resolveProviderNode({ providers, providerNodes }, selectedNodeId)` —— 从 `nodePoolStore`(5.4 独立后的 store)读 providers+providerNodes 两数组,合并出 `ResolvedProviderNode`(含 baseURL/apiKey/model 等运行时连接信息 + 当前轮询选中的 key)
3. **次数扣减**:调 `consumeProviderUsage(node.id)` —— 检查该节点今日额度,扣 1,额度耗尽则拦截
4. **适配调度接口**:**这里是陷阱**——单章清理需要 `maxConcurrency:1 / batchChars:999999 / intervalSec:0` 的特化值,不能直接用 ResolvedProviderNode 的真实配置。需调一个薄适配函数 `toSingleNodeClean(node): SchedulableNode`,把这三个字段覆写为单章特化值(其余字段直接透传)
5. **发起请求**:`streamSingleChannel(cleanNode, chapter, cb, { systemPrompt })` —— 走 `/api/llm/clean` SSE 端点,后端只收 `{baseURL, apiKey, model}`,不感知节点池
6. **流式回写**:SSE chunk → `onChunk` 回调 → `setLiveAcc(acc)` 更新右栏流式文本
7. **完成**:流结束 → `onDone` → 切 DiffView 审阅 → 用户接受 → `finalText` 覆盖原文

**模块化前后对比**:
- **前**:步骤 4 手工构造整个 `CleanNode` 对象(ImmersiveReader.tsx:427-430,6 行)
- **后**:步骤 4 只覆写 3 个特化字段,其余透传(1 行薄适配)

### 场景 2:批量章节生成(batch-generate,复杂路径)

**前置**:用户在「批量生产」页选了一批待生成章节,配置了 3 个文本节点,点「开始」。

**运作流程**:

1. **UI 触发**:`batch-generate/index.tsx` 调 `startBatchGenerate(tasks, nodes, cb, opts)`,nodes 是 3 个 `SchedulableNode`(由 `resolveProviderNodes` 批量解析后直接满足接口,无需手工映射)
2. **初始化运行态**:调度器为 3 个节点各建一个 `NodeRuntime { activeCount: 0, lastRequestTime: 0 }`,存入 `NodeRuntimeMap`
3. **选节点(worker 循环)**:调度器循环调 `pickLeastLoadedNode(nodeConfigs, states, { now, isExternalAvailable })`:
   - 对每个节点调 `isNodeAvailableNow`:检查 `activeCount < maxConcurrency`(并发未满)+ `now - lastRequestTime >= intervalSec`(间隔已过)+ `isExternalAvailable(nodeId)`(外部次数未耗尽)
   - 通过的节点按「最久未用 → 最少连接」排序,取第一个
4. **占用节点**:选中后 `state.activeCount++` + `state.lastRequestTime = now`,发起 draft 请求(`/api/llm/draft` SSE)
5. **并发流转**:3 个节点各有自己的 maxConcurrency(如 2/2/1),调度器同时跑 min(总并发,剩余任务)个任务;每完成一个,`activeCount--`,回到步骤 3 取下一个
6. **draft→finalize 串行**:单个任务的 draft 流完后,同一节点继续跑 finalize(`/api/llm/finalize`),两阶段都成功才算完成
7. **失败即停**:任一任务 draft/finalize 失败 → `onError` → 整批停止(不重试,与 M1 清理不同)
8. **全部完成**:`active === 0 && pendingQueue.length === 0` → `onFinish`

**NodeRuntime 状态变更示例**(3 节点,节点 A 并发 2):

```
t=0ms   A:{active:0,last:0}  B:{active:0,last:0}  C:{active:0,last:0}
        pickLeastLoaded → 选A(最久未用) → A:{active:1,last:0}
t=5ms   pickLeastLoaded → 选B → B:{active:1,last:5}
t=10ms  pickLeastLoaded → 选C → C:{active:1,last:10}
t=50ms  pickLeastLoaded → A仍可并发(active:1<2) → A:{active:2,last:50}
t=55ms  pickLeastLoaded → A满(active:2>=2)跳过,B间隔未到跳过 → 选...无候选,等待
t=300ms A的draft-1完成 → A:{active:1,last:50} → 下一轮又可选A
```

---

## 16. 关键数据切片(Data Payload Snapshot)

> 极简 JSON 片段,展示数据结构在模块间穿梭的真实形态。

### 切片 1:ResolvedProviderNode(运行时完整视图)

> `resolveProviderNode()` 的产出,ProviderNode + Provider 连接信息 + 当前选中 key 的合并体。大部分消费方用这个。

```json
{
  "id": "node-001",
  "providerId": "prov-openai",
  "nodeType": "text",
  "model": "gpt-4o",
  "enabled": true,
  "maxConcurrency": 2,
  "batchChars": 4000,
  "intervalSec": 1,
  "usageLimitEnabled": true,
  "usageLimit": 1000,
  "usageLeft": 873,
  "usageResetDate": "2026-06-30",
  "isMultimodal": false,
  "lastTestResult": "ok",

  "providerName": "OpenAI 官方",
  "name": "OpenAI 官方 · gpt-4o",
  "baseURL": "https://api.openai.com/v1",
  "apiKey": "sk-proj-xxxx...xxxx",
  "apiKeyId": "key-001",
  "supportsImageEdit": false
}
```

### 切片 2:SchedulableNode(调度器消费的子集)

> 调度器只关心「怎么连 + 并发/间隔约束」,不关心 providerId/usageLimit/enabled/lastTestResult 等管理字段。`batchChars` 可选(仅文本清理用)。

```json
{
  "id": "node-001",
  "name": "OpenAI 官方 · gpt-4o",
  "baseURL": "https://api.openai.com/v1",
  "apiKey": "sk-proj-xxxx...xxxx",
  "model": "gpt-4o",
  "maxConcurrency": 2,
  "intervalSec": 1,
  "batchChars": 4000
}
```

**对比 ResolvedProviderNode 剥离的字段**:
- 管理字段:`providerId` / `nodeType` / `enabled` / `isMultimodal` / `lastTestResult` / `usageLimitEnabled` / `usageLimit` / `usageLeft` / `usageResetDate` / `providerName` / `apiKeyId` / `supportsImageEdit` / `protocol`
- 保留字段:`id` / `name` / `baseURL` / `apiKey` / `model` / `maxConcurrency` / `intervalSec` + 可选 `batchChars`

**两个字段差异点**(5.3 已修正):
- `batchChars`:CleanNode 必填,BatchGenNode 无此字段 → SchedulableNode 设为**可选** `batchChars?`
- ResolvedProviderNode 含 batchChars(继承自 ProviderNode)→ 满足 CleanNode(`SchedulableNode & { batchChars: number }`)

### 切片 3:NodeRuntime + NodeRuntimeMap(并发运行态)

> 调度器内部维护的运行态,不持久化。记录每个节点当前活跃请求数 + 上次请求时间,供 `isNodeAvailableNow` / `pickLeastLoadedNode` 判定。

**初始态**(3 节点刚启动):
```json
{
  "node-001": { "activeCount": 0, "lastRequestTime": 0 },
  "node-002": { "activeCount": 0, "lastRequestTime": 0 },
  "node-003": { "activeCount": 0, "lastRequestTime": 0 }
}
```

**并发中态**(节点 A maxConcurrency:2,已占满;节点 B 间隔未到;节点 C 空闲):
```json
{
  "node-001": { "activeCount": 2, "lastRequestTime": 1751289600123 },
  "node-002": { "activeCount": 1, "lastRequestTime": 1751289600108 },
  "node-003": { "activeCount": 0, "lastRequestTime": 1751289550000 }
}
```

**此时 `pickLeastLoadedNode` 的判定**:
- node-001:`activeCount(2) >= maxConcurrency(2)` → 跳过
- node-002:`now - lastRequestTime(15ms) < intervalSec*1000(1000ms)` → 跳过(间隔未到)
- node-003:通过 → 选中(`activeCount:0` 最少连接,`lastRequestTime` 最旧)

**请求完成后**:`activeCount--`,不重置 `lastRequestTime`(间隔约束基于上次发起时间,非完成时间)
