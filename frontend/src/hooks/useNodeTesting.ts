import { useMemo, useState } from 'react'
import { App } from 'antd'
import { useAppStore } from '../store/appStore'
import { testProvider } from '../services/api'
import { parseSSE } from '../services/sse'
import type { ResolvedProviderNode } from '../services/types'
import { resolveProviderNodes } from '../utils/providerResolver'

async function probeOnce(
  node: Pick<ResolvedProviderNode, 'baseURL' | 'apiKey' | 'model'>,
  content: string,
  systemPrompt: string,
): Promise<{ ok: boolean; error?: string }> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 15000)
  try {
    const res = await fetch('/api/llm/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseURL: node.baseURL,
        apiKey: node.apiKey,
        model: node.model,
        content,
        systemPrompt,
      }),
      signal: ac.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `HTTP ${res.status}${text ? `：${text.slice(0, 120)}` : ''}` }
    }
    if (!res.body) return { ok: false, error: '响应无 body' }
    const reader = res.body.getReader()
    for (;;) {
      const { done } = await reader.read()
      if (done) break
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    clearTimeout(timer)
  }
}

export function useNodeTesting() {
  const { message } = App.useApp()
  const storeProviders = useAppStore((s) => s.providers)
  const storeProviderNodes = useAppStore((s) => s.providerNodes)
  const updateProviderNode = useAppStore((s) => s.updateProviderNode)
  const m1SystemPrompt = useAppStore((s) => s.m1SystemPrompt)
  const m1TestText = useAppStore((s) => s.m1TestText)

  const resolvedNodes = useMemo(
    () => resolveProviderNodes({ providers: storeProviders, providerNodes: storeProviderNodes }),
    [storeProviders, storeProviderNodes],
  )

  const [batchTesting, setBatchTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    node: ResolvedProviderNode
    ok: boolean
    models: string[]
    error?: string
  } | null>(null)
  const [concurrencyResult, setConcurrencyResult] = useState<{
    node: ResolvedProviderNode
    log: string[]
    maxConcurrency?: number
    intervalSec?: number
    error?: string
  } | null>(null)
  const [testingNode, setTestingNode] = useState<ResolvedProviderNode | null>(null)
  const [testStreaming, setTestStreaming] = useState(false)
  const [testStreamLeft, setTestStreamLeft] = useState('')
  const [testStreamRight, setTestStreamRight] = useState('')

  const testNode = async (node: ResolvedProviderNode) => {
    setTestResult(null)
    const result = await testProvider({ baseURL: node.baseURL, apiKey: node.apiKey, model: node.model })
    const nodeInStore = storeProviderNodes.find((n) => n.id === node.id)
    if (nodeInStore) {
      updateProviderNode({ ...nodeInStore, lastTestResult: result.ok ? 'ok' : 'fail' })
    }
    setTestResult({ node, ok: result.ok, models: result.models, error: result.error })
  }

  const concurrencyTestNode = async (node: ResolvedProviderNode) => {
    const log: string[] = []
    const push = (s: string) => {
      log.push(s)
      setConcurrencyResult({ node, log: [...log] })
    }
    const testText = useAppStore.getState().m1TestText || ''
    const systemPrompt = useAppStore.getState().m1SystemPrompt || ''
    try {
      push('① 单发探测连通性...')
      const t0 = Date.now()
      const probe = await probeOnce(node, testText, systemPrompt)
      const singleLatency = Date.now() - t0
      if (!probe.ok) {
        push(`✗ 探测失败：${probe.error}`)
        setConcurrencyResult({ node, log, error: probe.error })
        return
      }
      push(`✓ 连通正常，单请求耗时 ${singleLatency}ms`)

      let bestN = 1
      const levels = [2, 4, 8, 16]
      for (const n of levels) {
        push(`② 尝试并发 ${n} 个请求...`)
        const t = Date.now()
        const results = await Promise.all(
          Array.from({ length: n }, () =>
            probeOnce(node, testText, systemPrompt).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : String(e) })),
          ),
        )
        const ok = results.filter((r) => r.ok).length
        const latency = Date.now() - t
        if (ok === n) {
          bestN = n
          push(`✓ 全部成功（${ok}/${n}），耗时 ${latency}ms`)
        } else {
          push(`△ 仅成功 ${ok}/${n}，达到瓶颈，回退到 ${bestN}`)
          break
        }
      }

      const intervalSec = bestN > 0 ? Math.max(0, Math.round(singleLatency / 1000 / bestN)) : 0
      push(`③ 推荐参数：最大并发 ${bestN}，请求间隔 ${intervalSec}s`)
      setConcurrencyResult({ node, log, maxConcurrency: bestN, intervalSec })
    } catch (e) {
      push(`✗ 异常：${e instanceof Error ? e.message : String(e)}`)
      setConcurrencyResult({ node, log, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const runBatchTest = async (nodeTypeFilter: 'text' | 'image') => {
    const targets = resolvedNodes.filter((n) => n.nodeType === nodeTypeFilter && n.enabled)
    if (!targets.length) {
      message.warning('当前类型没有已启用的节点')
      return
    }
    setBatchTesting(true)
    let done = 0
    let okCount = 0
    const CONCURRENCY = 4
    const idx = { i: 0 }
    const runOne = async (node: ResolvedProviderNode) => {
      const result = await testProvider({ baseURL: node.baseURL, apiKey: node.apiKey, model: node.model })
      const raw = storeProviderNodes.find((n) => n.id === node.id)
      if (raw) updateProviderNode({ ...raw, lastTestResult: result.ok ? 'ok' : 'fail' })
      done += 1
      if (result.ok) okCount += 1
      message.info({ content: `批量测试进度：${done}/${targets.length}`, key: 'batch-test-progress' })
    }
    const workers: Promise<void>[] = []
    for (let w = 0; w < CONCURRENCY; w++) {
      workers.push(
        (async () => {
          while (idx.i < targets.length) {
            const node = targets[idx.i++]
            await runOne(node)
          }
        })(),
      )
    }
    await Promise.all(workers)
    setBatchTesting(false)
    message.success(`批量测试完成：${okCount}/${targets.length} 正常`)
  }

  const startRealTest = async () => {
    if (!testingNode) return
    setTestStreaming(true)
    setTestStreamLeft(m1TestText)
    setTestStreamRight('')

    try {
      const res = await fetch('/api/llm/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseURL: testingNode.baseURL,
          apiKey: testingNode.apiKey,
          model: testingNode.model,
          content: m1TestText,
          systemPrompt: m1SystemPrompt,
        }),
      })

      if (!res.ok) {
        message.error(`测试失败：HTTP ${res.status}`)
        setTestStreaming(false)
        return
      }
      if (!res.body) {
        message.error('响应无 body')
        setTestStreaming(false)
        return
      }

      let acc = ''
      for await (const { event, data } of parseSSE(res.body)) {
        const d = data as { delta?: string; text?: string }
        if (event === 'delta' && typeof d.delta === 'string') {
          acc += d.delta
          setTestStreamRight(acc)
        } else if (event === 'done' && typeof d.text === 'string') {
          acc = d.text
          setTestStreamRight(acc)
        }
      }

      message.success('测试完成')
    } catch (e) {
      message.error(`测试异常：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setTestStreaming(false)
    }
  }

  const applyConcurrencyParams = () => {
    if (!concurrencyResult || concurrencyResult.maxConcurrency === undefined) return
    const { node, maxConcurrency, intervalSec } = concurrencyResult
    const raw = storeProviderNodes.find((n) => n.id === node.id)
    if (raw) updateProviderNode({ ...raw, maxConcurrency, intervalSec: intervalSec ?? 0 })
    message.success(`已写回：最大并发 ${maxConcurrency}，请求间隔 ${intervalSec}s`)
    setConcurrencyResult(null)
  }

  const applyTestModel = (model: string) => {
    if (!testResult) return
    const raw = storeProviderNodes.find((n) => n.id === testResult.node.id)
    if (raw) updateProviderNode({ ...raw, model })
    setTestResult((r) => (r ? { ...r, node: { ...r.node, model } } : r))
    message.success(`已将「${testResult.node.name}」默认模型设为 ${model}`)
  }

  return {
    resolvedNodes,
    batchTesting,
    runBatchTest,
    testResult,
    setTestResult,
    testNode,
    concurrencyResult,
    setConcurrencyResult,
    concurrencyTestNode,
    applyConcurrencyParams,
    testingNode,
    setTestingNode,
    testStreaming,
    testStreamLeft,
    testStreamRight,
    startRealTest,
    applyTestModel,
    m1SystemPrompt,
    m1TestText,
  }
}
