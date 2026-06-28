import type { GameState, CompanyState } from '../types'
import companiesData from '../data/companies/richman4-companies.json'
import type { CompanyDefinition } from '../types'

const COMPANY_LAND_BONUS_RATE = 0.10
const CHAIRMAN_FEE_RATE = 0.05

function findCompanyDef(companyId: string): CompanyDefinition | undefined {
  return (companiesData as CompanyDefinition[]).find((c) => c.id === companyId)
}

export function getCompanyState(companyId: string, economy: GameState['economy']): CompanyState | undefined {
  return economy?.companies[companyId]
}

export function handleCompanyLand(state: GameState, companyId: string): GameState {
  const economy = state.economy
  if (!economy) return state
  const company = economy.companies[companyId]
  if (!company) return state
  const def = findCompanyDef(companyId)
  if (!def) return state

  const players = state.players.map((p) => ({ ...p }))
  const log = [...state.log]
  const player = players.find((p) => p.id === state.turnContext.currentPlayerId)
  if (!player) return state

  const heldShares = player.stocks?.[companyId] ?? 0
  const bonus = Math.floor(company.stockPrice * heldShares * COMPANY_LAND_BONUS_RATE)
  if (bonus > 0) {
    player.cash += bonus
    log.push({ seq: log.length, kind: 'company', text: `${player.name} 到达「${def.name}」，凭 ${heldShares} 股获得红利 ¥${bonus}` })
  } else {
    log.push({ seq: log.length, kind: 'company', text: `${player.name} 到达「${def.name}」（持股 ${heldShares} 股）` })
  }

  const totalShares = Object.values(company.shareholders).reduce((s, v) => s + v, 0)
  for (const [pid, shares] of Object.entries(company.shareholders)) {
    if (shares > totalShares / 2) {
      const chairman = players.find((p) => p.id === pid)
      if (chairman && chairman.id !== player.id && !chairman.bankrupt) {
        const fee = Math.floor(company.stockPrice * CHAIRMAN_FEE_RATE)
        chairman.cash += fee
        log.push({ seq: log.length, kind: 'company', text: `${chairman.name} 作为董事长获得过路费 ¥${fee}` })
      }
    }
  }

  return { ...state, players, log }
}
