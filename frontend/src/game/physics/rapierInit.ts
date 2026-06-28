import RAPIER from '@dimforge/rapier3d-compat'

let initPromise: Promise<typeof RAPIER> | null = null

export function ensureRapierReady(): Promise<typeof RAPIER> {
  if (!initPromise) initPromise = RAPIER.init().then(() => RAPIER)
  return initPromise
}
