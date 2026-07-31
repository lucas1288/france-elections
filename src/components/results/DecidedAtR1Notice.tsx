import type { Granularity } from '../../store/electionStore'
import { isDeptCode } from '../../utils/deptInsight'
import { Notice } from './Notice'
import type { RowDensity } from './ForceRows'

interface Props {
  density: RowDensity
  granularity: Granularity
  /** INSEE code of the RESOLVED entry (not the raw selection). */
  code: string
}

/**
 * Shown when the selected territory's round-2 figures are actually its ROUND-1
 * figures — its circo(s) were won outright at round 1, so there was no second
 * round to report (`decidedAtR1`, see the data-format note in CLAUDE.md).
 *
 * Without this the panel silently presents round-1 numbers under a "2nd tour"
 * heading, which is what made Paris at légis 2024 T2 look wrong: a third of its
 * circos were decided at T1, so the T2 view mixed two different rounds with no
 * indication. The map mutes these territories (R2a); this is the panel half.
 *
 * The wording adapts to what was actually decided — one seat for a
 * circonscription, all of them for a commune or département — because "cette
 * circonscription" would be plainly wrong on a département. Unlike the other
 * notices the copy is NOT duplicated per platform: there's nothing here that
 * needs to be shorter on mobile.
 */
export function DecidedAtR1Notice({ density, granularity, code }: Props) {
  // A circo entry is one resolved on the circo/hemicycle tabs; a département
  // code selected from those tabs still resolves to the dept-level entry.
  const isCirco = granularity !== 'commune' && !isDeptCode(code)

  return (
    <Notice density={density}>
      {isCirco
        ? 'Siège remporté dès le 1er tour : il n’y a pas eu de second tour dans cette circonscription. Les résultats ci-dessous sont ceux du 1er tour.'
        : 'Pas de second tour sur ce territoire : toutes ses circonscriptions ont été remportées dès le 1er tour. Les résultats ci-dessous sont ceux du 1er tour.'}
    </Notice>
  )
}
