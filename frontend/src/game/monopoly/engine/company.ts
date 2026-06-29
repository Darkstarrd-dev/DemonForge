import type { GameState, CompanyState } from '../types'
import { CompanyType } from '../types'
import companiesData from '../data/companies/richman4-companies.json'
import type { CompanyDefinition } from '../types'

const COMPANY_LAND_BONUS_RATE = 0.10

const CHAIRMAN_FEE_RATES: Record<CompanyType, number> = {
  [CompanyType.BANK]: 0.05,
  [CompanyType.DEPARTMENT_STORE]: 0.025,
  [CompanyType.GAS_STATION]: 0.05,
  [CompanyType.AMUSEMENT_PARK]: 0.05,
  [CompanyType.RESTAURANT]: 0,
  [CompanyType.TECH_COMPANY]: 0.05,
  [CompanyType.INSURANCE_COMPANY]: 0.05,
}

const CHAIRMAN_TURN_BONUS: Partial<Record<CompanyType, number>> = {
  [CompanyType.GAS_STATION]: 0.02,
  [CompanyType.AMUSEMENT_PARK]: 0.02,
}

function findCompanyDef(companyId: string): CompanyDefinition | undefined {
  return (companiesData as CompanyDefinition[]).find((c) => c.id === companyId)
}

export function getCompanyState(companyId: string, economy: GameState['economy']): CompanyState | undefined {
  return economy?.companies[companyId]
}

function getChairmanId(company: CompanyState, totalShares: number): string | undefined {
  for (const [pid, shares] of Object.entries(company.shareholders)) {
    if (shares > totalShares / 2) return pid
  }
  return undefined
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
  const chairmanId = getChairmanId(company, totalShares)
  if (chairmanId && chairmanId !== player.id) {
    const chairman = players.find((p) => p.id === chairmanId)
    if (chairman && !chairman.bankrupt) {
      const feeRate = CHAIRMAN_FEE_RATES[def.type] ?? 0.05
      const fee = Math.floor(company.stockPrice * feeRate)
      if (fee > 0) {
        chairman.cash += fee
        log.push({ seq: log.length, kind: 'company', text: `${chairman.name} 作为「${def.name}」董事长获得过路费 ¥${fee}` })
      } else {
        log.push({ seq: log.length, kind: 'company', text: `${chairman.name} 作为「${def.name}」董事长，落地玩家免过路费` })
      }
    }
  }

  return { ...state, players, log }
}

export function applyChairmanPrivileges(state: GameState): GameState {
  const economy = state.economy
  if (!economy) return state
  const players = state.players.map((p) => ({ ...p }))
  const log = [...state.log]
  let changed = false

  for (const [companyId, company] of Object.entries(economy.companies)) {
    const def = findCompanyDef(companyId)
    if (!def) continue
    const totalShares = Object.values(company.shareholders).reduce((s, v) => s + v, 0)
    const chairmanId = getChairmanId(company, totalShares)
    if (!chairmanId) continue
    const chairman = players.find((p) => p.id === chairmanId)
    if (!chairman || chairman.bankrupt) continue

    const bonusRate = CHAIRMAN_TURN_BONUS[def.type]
    if (bonusRate) {
      const bonus = Math.floor(company.stockPrice * bonusRate)
      if (bonus > 0) {
        chairman.cash += bonus
        log.push({ seq: log.length, kind: 'company', text: `${chairman.name} 作为「${def.name}」董事长获得分成 ¥${bonus}` })
        changed = true
      }
    }

    if (def.type === CompanyType.BANK && (chairman.bankDeposit ?? 0) > 0) {
      const extra = Math.floor((chairman.bankDeposit ?? 0) * (economy.depositInterestRate ?? 0.05))
      if (extra > 0) {
        chairman.cash += extra
        log.push({ seq: log.length, kind: 'company', text: `${chairman.name} 作为「${def.name}」董事长获得存款利率翻倍奖励 ¥${extra}` })
        changed = true
      }
    }

    if (def.type === CompanyType.INSURANCE_COMPANY && (chairman.hospitalTurns ?? 0) > 0) {
      if (chairman.isCollectingRent === false) {
        chairman.isCollectingRent = true
        log.push({ seq: log.length, kind: 'company', text: `${chairman.name} 作为「${def.name}」董事长，住院期间仍可收租` })
        changed = true
      }
    }
  }

  if (!changed) return state
  return { ...state, players, log }
}
