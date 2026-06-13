/**
 * Maps candidate names and party codes to their official or conventional colors.
 * Names appear in two formats depending on the data source:
 *   - Ministry TXT files: "Prénom NOM" (last name all-caps)
 *   - Placeholder data:   "Prénom Nom"
 * Both forms are listed here so lookups work regardless of source.
 */

const BY_NAME: Record<string, string> = {
  // 2022 Presidential — ministry format (last name all-caps)
  'Emmanuel MACRON':         '#FF8C00',
  'Marine LE PEN':           '#003189',
  'Jean-Luc MÉLENCHON':     '#CC2443',
  'Éric ZEMMOUR':            '#1D1D1B',
  'Valérie PÉCRESSE':        '#0066CC',
  'Yannick JADOT':           '#2ECC71',
  'Jean LASSALLE':           '#8B6914',
  'Anne HIDALGO':            '#E75480',
  'Fabien ROUSSEL':          '#B22222',
  'Nicolas DUPONT-AIGNAN':   '#4B0082',
  'Nathalie ARTHAUD':        '#CC0000',
  'Philippe POUTOU':         '#E05206',

  // Placeholder / normalised format
  'Emmanuel Macron':         '#FF8C00',
  'Marine Le Pen':           '#003189',
  'Jean-Luc Mélenchon':     '#CC2443',
}

const BY_PARTY: Record<string, string> = {
  LREM: '#FF8C00',
  RN:   '#003189',
  LFI:  '#CC2443',
  REC:  '#1D1D1B',
  LR:   '#0066CC',
  EELV: '#2ECC71',
  RES:  '#8B6914',
  PS:   '#E75480',
  PCF:  '#B22222',
  DLF:  '#4B0082',
  LO:   '#CC0000',
  NPA:  '#E05206',
}

const FALLBACK_COLORS = [
  '#6366f1', '#ec4899', '#14b8a6', '#f59e0b',
  '#84cc16', '#a855f7', '#f97316', '#06b6d4',
]

import type { Palette } from '../types/election'

/** Builds a candidate-name → party-code lookup from an election's candidate list. */
export function partyByName(candidates: Array<{ name: string; party: string }>): Map<string, string> {
  return new Map(candidates.map((c) => [c.name, c.party]))
}

/**
 * Returns the hex color for a candidate (or nuance/list for legislatives).
 * Resolution order: election palette by name → palette by party/nuance code →
 * built-in 2022 tables (legacy fallback) → stable categorical palette entry.
 */
export function getCandidateColor(
  candidateName: string,
  index = 0,
  party?: string,
  palette?: Palette | null,
): string {
  return (
    palette?.byName?.[candidateName] ??
    (party ? palette?.parties?.[party]?.color : undefined) ??
    BY_NAME[candidateName] ??
    (party ? BY_PARTY[party] : undefined) ??
    FALLBACK_COLORS[index % FALLBACK_COLORS.length]
  )
}
