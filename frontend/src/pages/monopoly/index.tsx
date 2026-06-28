import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Button, Segmented, Switch, Tooltip, Typography, theme } from 'antd'
import { createInitialState, reducer, rollDice } from '../../game/monopoly/engine'
import { aiNextAction, configureAIController, resetAIController } from '../../game/monopoly/engine/ai'
import type { NewGamePlayerSpec, GameState, SaveGame } from '../../game/monopoly/types'
import { mapEntityCardToCharacter } from '../../game/monopoly/engine/character-mapper'
import { useAppStore } from '../../store/appStore'
import { streamChat } from '../../services/api'
import type { ChatMessage } from '../../services/api'
import Board from './Board'
import Board3D from './Board3D'
import PlayerHUD from './PlayerHUD'
import GamePanel from './GamePanel'
import DecisionModal from './DecisionModal'
import NewGameModal from './NewGameModal'
import SaveLoadModal from './SaveLoadModal'

function buildDefaultPlayersFromCards(cards: ReturnType<typeof useAppStore.getState>['cards']): NewGamePlayerSpec[] {
  const chars = cards.filter((c) => c.type === 'character').map(mapEntityCardToCharacter)
  return chars.slice(0, 3).map(
    (c, i): NewGamePlayerSpec => ({
      name: c.name,
      color: c.color,
      controller: i === 0 ? 'human' : 'ai',
      characterCardId: c.id,
      aiDifficulty: 'normal',
    }),
  )
}

const AI_DELAY = 800

function initGame(): GameState {
  const defaultPlayers = buildDefaultPlayersFromCards(useAppStore.getState().cards)
  return createInitialState({
    mapId: 'classic-40',
    players: defaultPlayers,
    startingCash: 15000,
  })
}

export default function MonopolyPage() {
  const { token } = theme.useToken()
  const [state, dispatch] = useReducer(reducer, undefined, initGame)
  const [newGameOpen, setNewGameOpen] = useState(false)
  const [saveLoadOpen, setSaveLoadOpen] = useState(false)
  const [saveLoadMode, setSaveLoadMode] = useState<'save' | 'load'>('save')
  const [view, setView] = useState<'2d' | '3d'>('2d')
  const [llmEnabled, setLlmEnabled] = useState(false)
  const lastStateRef = useRef(state)
  useEffect(() => { lastStateRef.current = state }, [state])

  const handleLLMDecide = useCallback(async (messages: ChatMessage[]): Promise<string> => {
    const providers = useAppStore.getState().providers.filter((n) => n.nodeType === 'text' && n.enabled)
    if (providers.length === 0) throw new Error('无可用文本节点')
    const provider = providers[0]
    return new Promise((resolve, reject) => {
      let result = ''
      streamChat(
        { baseURL: provider.baseURL, apiKey: provider.apiKey, model: provider.model, messages },
        {
          delta: (d) => { result += d },
          done: () => resolve(result),
          error: (e) => reject(new Error(e)),
        },
      )
    })
  }, [])

  const getPersona = useCallback((playerId: string): string => {
    const s = lastStateRef.current
    const player = s.players.find((p) => p.id === playerId)
    if (!player?.characterCardId) return '普通玩家'
    const allCards = useAppStore.getState().cards
    const card = allCards.find((c) => c.id === player.characterCardId)
    return card ? `${card.description}${card.styleNote ? `\n语言风格：${card.styleNote}` : ''}` : '普通玩家'
  }, [])

  useEffect(() => {
    if (llmEnabled) {
      configureAIController({ llmFn: handleLLMDecide, getPersona })
    } else {
      resetAIController()
    }
  }, [llmEnabled, handleLLMDecide, getPersona])

  useEffect(() => {
    const action = aiNextAction(state)
    if (!action) return
    const timer = setTimeout(() => dispatch(action), AI_DELAY)
    return () => clearTimeout(timer)
  }, [state])

  const current = state.players.find((p) => p.id === state.turnContext.currentPlayerId)
  const interactive = current?.controller === 'human'
  const onRoll = () => dispatch({ type: 'ROLL_DICE', dice: rollDice(current?.vehicle) })
  const onEndTurn = () => dispatch({ type: 'END_TURN' })
  const onDecide = (optionId: string) => dispatch({ type: 'RESOLVE_DECISION', optionId })
  const onMortgage = (tileId: string) => dispatch({ type: 'MORTGAGE_PROPERTY', tileId })
  const onRedeem = (tileId: string) => dispatch({ type: 'REDEEM_PROPERTY', tileId })
  const onUseCard = (cardInstanceId: string, targetId?: string, targetTileId?: string) =>
    dispatch({ type: 'USE_CARD', cardInstanceId, targetId, targetTileId } as const)
  const onBuyCard = (cardDefId: string) => dispatch({ type: 'BUY_CARD', cardDefId })
  const onUseItem = (itemInstanceId: string, targetId?: string, targetTileId?: string) =>
    dispatch({ type: 'USE_ITEM', itemInstanceId, targetId, targetTileId } as const)
  const onBuyItem = (itemDefId: string) => dispatch({ type: 'BUY_ITEM', itemDefId })
  const onStartNewGame = (players: NewGamePlayerSpec[], mapId: string, configPresetId?: string) => {
    dispatch({
      type: 'NEW_GAME',
      config: { mapId, players, startingCash: 15000, configPresetId },
    })
  }

  const onLoadSave = (save: SaveGame) => {
    dispatch({ type: 'LOAD_GAME', save })
  }

  const gameConfig = state.config ?? null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: token.colorBgLayout,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '8px 16px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          flexShrink: 0,
        }}
      >
        <Typography.Text strong style={{ fontSize: 15, color: token.colorText }}>
          🎲 大富翁
        </Typography.Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Tooltip title="AI 玩家使用 LLM 决策（需配置至少一个文本节点）">
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13, color: token.colorTextSecondary }}>
              <Switch size="small" checked={llmEnabled} onChange={setLlmEnabled} />
              LLM 决策
            </label>
          </Tooltip>
          <Segmented
            value={view}
            onChange={(v) => setView(v as '2d' | '3d')}
            options={[
              { label: '2D', value: '2d' },
              { label: '3D', value: '3d' },
            ]}
          />
          <Button size="small" onClick={() => setNewGameOpen(true)}>
            新游戏
          </Button>
          <Button size="small" onClick={() => { setSaveLoadMode('save'); setSaveLoadOpen(true) }} disabled={state.status === 'ended'}>
            存档
          </Button>
          <Button size="small" onClick={() => { setSaveLoadMode('load'); setSaveLoadOpen(true) }}>
            读档
          </Button>
        </div>
      </div>

      <PlayerHUD players={state.players} currentPlayerId={state.turnContext.currentPlayerId} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
          {view === '2d' ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                overflow: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
              }}
            >
              <Board state={state} />
            </div>
          ) : (
            <Board3D state={state} />
          )}
        </div>
        <GamePanel
          state={state}
          current={current}
          interactive={interactive}
          onRoll={onRoll}
          onEndTurn={onEndTurn}
          onMortgage={onMortgage}
          onRedeem={onRedeem}
          onUseCard={onUseCard}
          onBuyCard={onBuyCard}
          onUseItem={onUseItem}
          onBuyItem={onBuyItem}
        />
      </div>

      <DecisionModal state={state} interactive={interactive} onDecide={onDecide} />
      <NewGameModal open={newGameOpen} onClose={() => setNewGameOpen(false)} onStart={onStartNewGame} />
      <SaveLoadModal
        open={saveLoadOpen}
        mode={saveLoadMode}
        onClose={() => setSaveLoadOpen(false)}
        state={state}
        config={gameConfig}
        onLoad={onLoadSave}
      />
    </div>
  )
}
