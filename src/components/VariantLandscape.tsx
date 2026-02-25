import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Dna, FlaskConical, Shield, Pill, Activity, ExternalLink } from 'lucide-react'
import CitationBadge from './CitationBadge'
import PatientFunnel from './PatientFunnel'
import {
  getAvailableGenes,
  getVariantsForGene,
  getVariantCard,
  getVariantLandscape,
} from '@/services/api-client'
import type {
  GeneInfo,
  VariantInfo,
  VariantCard,
  VariantLandscapeData,
} from '@/services/api-client'

// OncoKB level colors
const LEVEL_COLORS: Record<string, string> = {
  LEVEL_1: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  LEVEL_2: 'bg-sky-100 text-sky-800 border-sky-300',
  LEVEL_3A: 'bg-amber-100 text-amber-800 border-amber-300',
  LEVEL_3B: 'bg-orange-100 text-orange-800 border-orange-300',
  LEVEL_4: 'bg-stone-100 text-stone-700 border-stone-300',
  LEVEL_R1: 'bg-red-100 text-red-800 border-red-300',
  LEVEL_R2: 'bg-rose-100 text-rose-800 border-rose-300',
}

const LEVEL_LABELS: Record<string, string> = {
  LEVEL_1: 'Level 1 — FDA-approved',
  LEVEL_2: 'Level 2 — Standard care',
  LEVEL_3A: 'Level 3A — Compelling evidence',
  LEVEL_3B: 'Level 3B — Emerging evidence',
  LEVEL_4: 'Level 4 — Biological evidence',
  LEVEL_R1: 'R1 — Resistance (standard care)',
  LEVEL_R2: 'R2 — Resistance (investigational)',
}

interface Props {
  indication: string
}

export default function VariantLandscape({ indication }: Props) {
  // Gene/variant selection state
  const [genes, setGenes] = useState<GeneInfo[]>([])
  const [genesLoading, setGenesLoading] = useState(true)
  const [selectedGene, setSelectedGene] = useState<string>('')
  const [variants, setVariants] = useState<VariantInfo[]>([])
  const [variantsLoading, setVariantsLoading] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState<string>('')

  // Data
  const [card, setCard] = useState<VariantCard | null>(null)
  const [cardLoading, setCardLoading] = useState(false)
  const [landscape, setLandscape] = useState<VariantLandscapeData | null>(null)
  const [landscapeLoading, setLandscapeLoading] = useState(false)

  // Load available genes on mount
  useEffect(() => {
    getAvailableGenes()
      .then(g => {
        setGenes(g)
        if (g.length > 0) {
          // Default to KRAS if available, else first
          const kras = g.find(x => x.gene === 'KRAS')
          setSelectedGene(kras ? 'KRAS' : g[0].gene)
        }
      })
      .catch(err => console.error('Failed to load genes:', err))
      .finally(() => setGenesLoading(false))
  }, [])

  // Load variants when gene changes
  useEffect(() => {
    if (!selectedGene) return
    setVariantsLoading(true)
    setSelectedVariant('')
    setCard(null)

    getVariantsForGene(selectedGene)
      .then(v => {
        setVariants(v)
        if (v.length > 0) {
          // Default to G12C if KRAS, else first
          const g12c = v.find(x => x.variant === 'G12C')
          setSelectedVariant(g12c ? 'G12C' : v[0].variant)
        }
      })
      .catch(err => console.error('Failed to load variants:', err))
      .finally(() => setVariantsLoading(false))

    // Also load landscape for this gene
    setLandscapeLoading(true)
    getVariantLandscape(selectedGene)
      .then(l => setLandscape(l))
      .catch(err => console.error('Failed to load landscape:', err))
      .finally(() => setLandscapeLoading(false))
  }, [selectedGene])

  // Load variant card when variant changes
  useEffect(() => {
    if (!selectedGene || !selectedVariant) return
    setCardLoading(true)
    getVariantCard(selectedGene, selectedVariant)
      .then(c => setCard(c))
      .catch(err => console.error('Failed to load variant card:', err))
      .finally(() => setCardLoading(false))
  }, [selectedGene, selectedVariant])

  // Sorted prevalence entries
  const prevalenceEntries = useMemo(() => {
    if (!card) return []
    return Object.entries(card.prevalence)
      .sort(([, a], [, b]) => b.frequency - a.frequency)
  }, [card])

  // Sorted actionability entries
  const actionabilityEntries = useMemo(() => {
    if (!card) return []
    return Object.entries(card.actionability)
  }, [card])

  if (genesLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-stone-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading variant intelligence...</span>
      </div>
    )
  }

  if (genes.length === 0) {
    return (
      <Card className="border-stone-200">
        <CardContent className="py-12 text-center">
          <Dna className="w-10 h-10 text-stone-300 mx-auto mb-3" />
          <p className="text-sm text-stone-500">No variant-level data available yet.</p>
          <p className="text-xs text-stone-400 mt-1">Run the variant enrichment pipeline to populate mutation prevalence and actionability data.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {/* Gene + Variant selectors */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Dna className="w-4 h-4 text-violet-600" />
          <span className="text-xs font-medium text-stone-500">Gene</span>
          <Select value={selectedGene} onValueChange={setSelectedGene}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {genes.map(g => (
                <SelectItem key={g.gene} value={g.gene}>
                  <span className="font-mono">{g.gene}</span>
                  <span className="text-stone-400 ml-2">{g.variantCount} variants</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-stone-500">Variant</span>
          {variantsLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
          ) : (
            <Select value={selectedVariant} onValueChange={setSelectedVariant}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {variants.map(v => (
                  <SelectItem key={v.variant} value={v.variant}>
                    <span className="font-mono">{v.variant}</span>
                    <span className="text-stone-400 ml-2">
                      {v.hasPrevalence && v.hasActionability ? 'prev+act' :
                       v.hasPrevalence ? 'prev' : 'act'}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {card && (
          <div className="ml-auto flex items-center gap-1.5">
            {card.provenance.map((p, i) => (
              <CitationBadge
                key={i}
                source={p.source}
                version={p.version}
                accessed={p.accessed}
              />
            ))}
          </div>
        )}
      </div>

      {cardLoading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-stone-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading {selectedGene} {selectedVariant} data...</span>
        </div>
      ) : card ? (
        <>
          {/* Top stats row */}
          <div className="grid grid-cols-5 gap-3">
            <Card className="border-stone-200">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xl font-bold">{prevalenceEntries.length}</p>
                    <p className="text-[10px] text-stone-500">Cancer types</p>
                  </div>
                  <Activity className="w-5 h-5 text-sky-500 opacity-60" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xl font-bold">
                      {prevalenceEntries.length > 0
                        ? `${(Math.max(...prevalenceEntries.map(([, p]) => p.frequency)) * 100).toFixed(1)}%`
                        : '—'}
                    </p>
                    <p className="text-[10px] text-stone-500">Peak prevalence</p>
                  </div>
                  <Dna className="w-5 h-5 text-violet-500 opacity-60" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xl font-bold">{actionabilityEntries.length}</p>
                    <p className="text-[10px] text-stone-500">Actionable indications</p>
                  </div>
                  <Shield className="w-5 h-5 text-emerald-500 opacity-60" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xl font-bold">{card.fdaApprovals.length}</p>
                    <p className="text-[10px] text-stone-500">FDA approvals</p>
                  </div>
                  <Pill className="w-5 h-5 text-amber-500 opacity-60" />
                </div>
              </CardContent>
            </Card>
            <Card className="border-stone-200">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xl font-bold">{card.trials.total}</p>
                    <p className="text-[10px] text-stone-500">Clinical trials</p>
                  </div>
                  <FlaskConical className="w-5 h-5 text-orange-500 opacity-60" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main content grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Prevalence */}
            <Card className="border-stone-200">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Mutation Prevalence</CardTitle>
                    <CardDescription className="text-xs">
                      {selectedGene} {selectedVariant} frequency across cancer types
                    </CardDescription>
                  </div>
                  <CitationBadge source="cbioportal" compact />
                </div>
              </CardHeader>
              <CardContent>
                {prevalenceEntries.length === 0 ? (
                  <p className="text-xs text-stone-400 py-6 text-center">No prevalence data available</p>
                ) : (
                  <div className="space-y-2">
                    {prevalenceEntries.map(([cancerType, prev]) => (
                      <div key={cancerType} className="flex items-center gap-2">
                        <span className="text-[11px] text-stone-600 w-40 shrink-0 truncate text-right" title={cancerType}>
                          {cancerType}
                        </span>
                        <div className="flex-1 h-5 bg-stone-100 rounded overflow-hidden relative">
                          <div
                            className="h-full bg-sky-500 rounded transition-all"
                            style={{ width: `${Math.max(2, prev.frequency * 100 * 3)}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-stone-700 w-14 text-right tabular-nums">
                          {(prev.frequency * 100).toFixed(1)}%
                        </span>
                        <span className="text-[10px] text-stone-400 w-20 text-right tabular-nums">
                          {prev.sampleCount}/{prev.totalProfiled}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actionability */}
            <Card className="border-stone-200">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Actionability Levels</CardTitle>
                    <CardDescription className="text-xs">
                      OncoKB therapeutic levels for {selectedGene} {selectedVariant}
                    </CardDescription>
                  </div>
                  <CitationBadge source="oncokb" compact />
                </div>
              </CardHeader>
              <CardContent>
                {actionabilityEntries.length === 0 ? (
                  <p className="text-xs text-stone-400 py-6 text-center">No actionability data available</p>
                ) : (
                  <div className="space-y-3">
                    {actionabilityEntries.map(([cancerType, act]) => (
                      <div key={cancerType} className="p-3 border border-stone-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-stone-800">{cancerType}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-semibold ${LEVEL_COLORS[act.level] || 'bg-stone-100 text-stone-600'}`}
                          >
                            {act.level.replace('LEVEL_', 'Level ').replace('_', '')}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-stone-500 mb-2">
                          {LEVEL_LABELS[act.level] || act.level}
                        </p>
                        {act.drugs.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1.5">
                            {act.drugs.map(d => (
                              <Badge key={d} variant="secondary" className="text-[10px] py-0">
                                {d}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {act.description && (
                          <p className="text-[10px] text-stone-400 leading-relaxed line-clamp-2">{act.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* FDA Approvals */}
            <Card className="border-stone-200">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">FDA Approvals & CDx</CardTitle>
                    <CardDescription className="text-xs">
                      Approved drugs and companion diagnostics for {selectedGene} {selectedVariant}
                    </CardDescription>
                  </div>
                  <CitationBadge source="openfda" compact />
                </div>
              </CardHeader>
              <CardContent>
                {card.fdaApprovals.length === 0 ? (
                  <p className="text-xs text-stone-400 py-6 text-center">No FDA approval data available</p>
                ) : (
                  <div className="space-y-2.5">
                    {card.fdaApprovals.map((fda, i) => (
                      <div key={i} className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-emerald-900">{fda.drugName}</span>
                          {fda.approvalDate && (
                            <span className="text-[10px] text-emerald-600 tabular-nums">{fda.approvalDate}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <Badge variant="outline" className="text-[9px] bg-white">{fda.applicationNumber}</Badge>
                          {fda.indication && (
                            <span className="text-[10px] text-stone-500">{fda.indication}</span>
                          )}
                        </div>
                        {fda.companionDxName && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-stone-400">CDx:</span>
                            <span className="text-[10px] text-emerald-700 font-medium">{fda.companionDxName}</span>
                            {fda.companionDxPma && (
                              <Badge variant="outline" className="text-[9px] py-0">{fda.companionDxPma}</Badge>
                            )}
                          </div>
                        )}
                        {fda.sourceUrl && (
                          <a
                            href={fda.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-sky-600 hover:underline flex items-center gap-0.5 mt-1"
                          >
                            FDA record <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Co-mutations + Trial Summary */}
            <div className="space-y-4">
              {/* Co-mutations */}
              <Card className="border-stone-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Co-occurring Mutations</CardTitle>
                  <CardDescription className="text-xs">
                    Genes frequently co-mutated with {selectedGene} {selectedVariant}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {card.coMutations.length === 0 ? (
                    <p className="text-xs text-stone-400 py-4 text-center">No co-mutation data available</p>
                  ) : (
                    <div className="space-y-1.5">
                      {card.coMutations.map(cm => (
                        <div key={cm.gene} className="flex items-center gap-2">
                          <span className="text-xs font-mono text-stone-700 w-16 shrink-0">{cm.gene}</span>
                          <div className="flex-1 h-4 bg-stone-100 rounded overflow-hidden">
                            <div
                              className="h-full bg-violet-400 rounded transition-all"
                              style={{ width: `${cm.freq * 100}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-stone-600 w-12 text-right tabular-nums">
                            {(cm.freq * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Trial Summary */}
              <Card className="border-stone-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Clinical Trial Activity</CardTitle>
                  <CardDescription className="text-xs">
                    Trials mentioning {selectedGene} {selectedVariant}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="p-2.5 bg-stone-50 rounded-lg text-center">
                      <p className="text-lg font-bold">{card.trials.total}</p>
                      <p className="text-[10px] text-stone-500">Total trials</p>
                    </div>
                    <div className="p-2.5 bg-emerald-50 rounded-lg text-center">
                      <p className="text-lg font-bold text-emerald-700">{card.trials.recruiting}</p>
                      <p className="text-[10px] text-stone-500">Recruiting</p>
                    </div>
                  </div>
                  {card.trials.byPhase.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-stone-400 font-medium">By Phase</p>
                      {card.trials.byPhase.map(p => (
                        <div key={p.phase} className="flex items-center justify-between">
                          <span className="text-xs text-stone-600">{p.phase}</span>
                          <span className="text-xs font-semibold tabular-nums">{p.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {card.trials.topSponsors.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-[10px] text-stone-400 font-medium">Top Sponsors</p>
                      {card.trials.topSponsors.slice(0, 5).map(s => (
                        <div key={s.name} className="flex items-center justify-between">
                          <span className="text-[11px] text-stone-600 truncate max-w-[200px]">{s.name}</span>
                          <span className="text-[11px] font-semibold tabular-nums">{s.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* CIViC Evidence */}
          {card.civicEvidence.length > 0 && (
            <Card className="border-stone-200">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">CIViC Evidence</CardTitle>
                    <CardDescription className="text-xs">
                      Clinical evidence from the Clinical Interpretation of Variants in Cancer database
                    </CardDescription>
                  </div>
                  <CitationBadge source="civic" compact />
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {card.civicEvidence.map((ev, i) => (
                    <div key={i} className="p-2.5 border border-stone-200 rounded-lg text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-[9px]">{ev.type}</Badge>
                        <span className="text-[10px] text-stone-400">{ev.level}</span>
                      </div>
                      <p className="text-stone-700 font-medium">{ev.disease}</p>
                      {ev.drugs.length > 0 && (
                        <p className="text-[10px] text-stone-500 mt-0.5">
                          Drugs: {ev.drugs.join(', ')}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-stone-400">{ev.significance} — {ev.direction}</span>
                        {ev.pmid && (
                          <a
                            href={`https://pubmed.ncbi.nlm.nih.gov/${ev.pmid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-sky-600 hover:underline"
                          >
                            PMID:{ev.pmid}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Patient Funnel */}
          <PatientFunnel
            gene={selectedGene}
            variant={selectedVariant}
            indication={indication}
          />

          {/* Variant Landscape Heatmap (for the selected gene) */}
          {landscape && !landscapeLoading && landscape.variants.length > 0 && (
            <Card className="border-stone-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {selectedGene} Variant Landscape
                </CardTitle>
                <CardDescription className="text-xs">
                  All known variants — prevalence frequency across cancer types
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="text-left py-1 px-2 text-stone-500 font-medium w-24">Variant</th>
                        {landscape.indications.map(ind => (
                          <th key={ind} className="text-center py-1 px-1.5 text-stone-500 font-medium text-[10px] w-20 truncate" title={ind}>
                            {ind.length > 12 ? ind.slice(0, 10) + '…' : ind}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {landscape.variants.slice(0, 20).map(vName => {
                        const prevRow = landscape.prevalenceHeatmap[vName] || {}
                        const actRow = landscape.actionabilityMap[vName] || {}
                        return (
                          <tr
                            key={vName}
                            className={`border-t border-stone-100 cursor-pointer hover:bg-stone-50 ${vName === selectedVariant ? 'bg-sky-50' : ''}`}
                            onClick={() => setSelectedVariant(vName)}
                          >
                            <td className="py-1.5 px-2 font-mono font-medium text-stone-800">{vName}</td>
                            {landscape.indications.map(ind => {
                              const freq = prevRow[ind]
                              const act = actRow[ind]
                              return (
                                <td key={ind} className="py-1.5 px-1.5 text-center">
                                  {freq !== undefined ? (
                                    <div className="relative group">
                                      <div
                                        className="w-full h-5 rounded"
                                        style={{
                                          backgroundColor: freq > 0.1 ? `rgba(14,165,233,${Math.min(1, freq * 4)})` :
                                            freq > 0 ? `rgba(14,165,233,${Math.max(0.1, freq * 8)})` : 'transparent',
                                        }}
                                      >
                                        {freq > 0 && (
                                          <span className={`text-[9px] font-bold leading-5 ${freq > 0.08 ? 'text-white' : 'text-sky-700'}`}>
                                            {(freq * 100).toFixed(1)}%
                                          </span>
                                        )}
                                      </div>
                                      {act && (
                                        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-white"
                                          style={{
                                            backgroundColor:
                                              act.level === 'LEVEL_1' ? '#22c55e' :
                                              act.level === 'LEVEL_2' ? '#3b82f6' :
                                              act.level.startsWith('LEVEL_3') ? '#f59e0b' :
                                              act.level.startsWith('LEVEL_R') ? '#ef4444' : '#a3a3a3'
                                          }}
                                          title={`${act.level}: ${act.drugs.join(', ')}`}
                                        />
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-stone-200">—</span>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Legend */}
                <div className="mt-3 flex items-center gap-4 text-[10px] text-stone-500">
                  <span className="font-medium">Prevalence:</span>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-3 rounded" style={{ backgroundColor: 'rgba(14,165,233,0.1)' }} />
                    <span>&lt;2%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-3 rounded" style={{ backgroundColor: 'rgba(14,165,233,0.4)' }} />
                    <span>2-10%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-4 h-3 rounded" style={{ backgroundColor: 'rgba(14,165,233,0.8)' }} />
                    <span>&gt;10%</span>
                  </div>
                  <span className="ml-4 font-medium">Actionability:</span>
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span>L1</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span>L2</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span>L3</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span>R</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  )
}
