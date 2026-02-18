import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import {
  Loader2, ExternalLink, ChevronDown, ChevronRight,
  FlaskConical, Pill, Shield, TestTube2, Dna, Newspaper,
  Building2, Users, Calendar, Beaker, Target, CheckCircle2,
  XCircle, AlertCircle, ClipboardList
} from 'lucide-react'
import { getEnrichedTrialDetail, type EnrichedTrialDetail, type TrialCrossReference } from '../services/api-client'

interface Props {
  nctId: string | null
  onClose: () => void
}

const EVIDENCE_COLORS: Record<string, string> = {
  'FDA guidelines': 'bg-emerald-100 text-emerald-800',
  'NCCN guidelines': 'bg-blue-100 text-blue-800',
  'Late trials': 'bg-amber-100 text-amber-800',
  'Early trials': 'bg-orange-100 text-orange-800',
  'Case report': 'bg-stone-100 text-stone-700',
  'Pre-clinical': 'bg-stone-50 text-stone-500',
}

export default function TrialDrillDown({ nctId, onClose }: Props) {
  const [data, setData] = useState<EnrichedTrialDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview', 'biomarkers']))
  const [expandedCrossRef, setExpandedCrossRef] = useState<string | null>(null)

  useEffect(() => {
    if (!nctId) {
      setData(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    getEnrichedTrialDetail(nctId)
      .then(d => { setData(d); setLoading(false) })
      .catch(err => { setError(err instanceof Error ? err.message : 'Failed to load'); setLoading(false) })
  }, [nctId])

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Score bar
  const ScoreBar = ({ label, value }: { label: string; value: number }) => (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-stone-500 w-24 text-right shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${value * 100}%`,
            backgroundColor: value > 0.7 ? '#22c55e' : value > 0.4 ? '#eab308' : value > 0 ? '#ef4444' : '#e7e5e4'
          }}
        />
      </div>
      <span className="text-[10px] text-stone-500 w-8 tabular-nums">{(value * 100).toFixed(0)}%</span>
    </div>
  )

  // Section header
  const SectionHeader = ({ id, icon: Icon, title, count, color }: {
    id: string; icon: React.ElementType; title: string; count?: number; color: string
  }) => (
    <button
      onClick={() => toggleSection(id)}
      className="flex items-center gap-2 w-full py-2 hover:bg-stone-50 rounded transition-colors"
    >
      {expandedSections.has(id) ? (
        <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
      ) : (
        <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
      )}
      <Icon className={`w-4 h-4 ${color}`} />
      <span className="text-sm font-semibold text-stone-900">{title}</span>
      {count !== undefined && count > 0 && (
        <Badge variant="secondary" className="text-[9px] py-0">{count}</Badge>
      )}
    </button>
  )

  // Cross-reference section for a biomarker×indication
  const CrossRefSection = ({ refKey, crossRef }: { refKey: string; crossRef: TrialCrossReference }) => {
    const isExpanded = expandedCrossRef === refKey
    const [bm, ind] = refKey.split(':')
    const hasData = crossRef.druggability || crossRef.approvedDrugs.length > 0 ||
      crossRef.cancerEvidence.length > 0 || crossRef.assays.length > 0 ||
      crossRef.gwasVariants.length > 0 || crossRef.pubmedArticles.length > 0

    if (!hasData) return null

    return (
      <div className="border border-stone-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setExpandedCrossRef(isExpanded ? null : refKey)}
          className="flex items-center justify-between w-full px-3 py-2 bg-stone-50 hover:bg-stone-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown className="w-3 h-3 text-stone-400" /> : <ChevronRight className="w-3 h-3 text-stone-400" />}
            <span className="text-xs font-bold text-stone-800">{bm}</span>
            <span className="text-[10px] text-stone-400">in</span>
            <span className="text-xs font-medium text-stone-600">{ind}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {crossRef.druggability && (
              <Badge variant="outline" className="text-[8px] py-0">OT {(crossRef.druggability.overallScore * 100).toFixed(0)}%</Badge>
            )}
            {crossRef.approvedDrugs.length > 0 && (
              <Badge className="bg-emerald-100 text-emerald-700 text-[8px] py-0">{crossRef.approvedDrugs.length} drugs</Badge>
            )}
            {crossRef.cancerEvidence.length > 0 && (
              <Badge className="bg-blue-100 text-blue-700 text-[8px] py-0">{crossRef.cancerEvidence.length} evidence</Badge>
            )}
          </div>
        </button>

        {isExpanded && (
          <div className="p-3 space-y-3 bg-white">
            {/* Druggability */}
            {crossRef.druggability && (
              <div>
                <p className="text-[10px] text-stone-400 font-medium uppercase tracking-wide mb-1.5">Druggability (Open Targets)</p>
                <div className="space-y-1">
                  <ScoreBar label="Overall" value={crossRef.druggability.overallScore} />
                  <ScoreBar label="Known Drugs" value={crossRef.druggability.drugScore} />
                  <ScoreBar label="Cancer BM" value={crossRef.druggability.cancerBiomarkerScore} />
                </div>
                <div className="flex items-center gap-3 mt-2 text-[10px]">
                  <span className={crossRef.druggability.smHasApprovedDrug ? 'text-emerald-700' : crossRef.druggability.smTractable ? 'text-amber-600' : 'text-stone-400'}>
                    {crossRef.druggability.smHasApprovedDrug ? <CheckCircle2 className="w-3 h-3 inline mr-0.5" /> :
                     crossRef.druggability.smTractable ? <AlertCircle className="w-3 h-3 inline mr-0.5" /> :
                     <XCircle className="w-3 h-3 inline mr-0.5" />}
                    SM: {crossRef.druggability.smHasApprovedDrug ? 'Approved' : crossRef.druggability.smTractable ? 'Tractable' : 'No'}
                  </span>
                  <span className={crossRef.druggability.abHasApprovedDrug ? 'text-emerald-700' : crossRef.druggability.abTractable ? 'text-amber-600' : 'text-stone-400'}>
                    {crossRef.druggability.abHasApprovedDrug ? <CheckCircle2 className="w-3 h-3 inline mr-0.5" /> :
                     crossRef.druggability.abTractable ? <AlertCircle className="w-3 h-3 inline mr-0.5" /> :
                     <XCircle className="w-3 h-3 inline mr-0.5" />}
                    Ab: {crossRef.druggability.abHasApprovedDrug ? 'Approved' : crossRef.druggability.abTractable ? 'Tractable' : 'No'}
                  </span>
                </div>
              </div>
            )}

            {/* Approved Drugs */}
            {crossRef.approvedDrugs.length > 0 && (
              <div>
                <p className="text-[10px] text-stone-400 font-medium uppercase tracking-wide mb-1.5">
                  Approved Drugs ({crossRef.approvedDrugs.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {crossRef.approvedDrugs.slice(0, 10).map((d, i) => (
                    <Badge key={i} className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px]">
                      {d.name} {d.yearApproved ? `(${d.yearApproved})` : ''}
                    </Badge>
                  ))}
                  {crossRef.approvedDrugs.length > 10 && (
                    <Badge variant="outline" className="text-[9px]">+{crossRef.approvedDrugs.length - 10} more</Badge>
                  )}
                </div>
              </div>
            )}

            {/* Cancer Evidence */}
            {crossRef.cancerEvidence.length > 0 && (
              <div>
                <p className="text-[10px] text-stone-400 font-medium uppercase tracking-wide mb-1.5">
                  Cancer Biomarker Evidence ({crossRef.cancerEvidence.length})
                </p>
                <div className="space-y-0.5">
                  {crossRef.cancerEvidence.slice(0, 8).map((ev, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[10px]">
                      <Badge className={`text-[8px] py-0 ${EVIDENCE_COLORS[ev.confidence] || 'bg-stone-100 text-stone-600'}`}>
                        {ev.confidence}
                      </Badge>
                      {ev.drug && <span className="text-stone-700 font-medium">{ev.drug}</span>}
                      {ev.disease && <span className="text-stone-400 truncate max-w-[150px]">{ev.disease}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Assays */}
            {crossRef.assays.length > 0 && (
              <div>
                <p className="text-[10px] text-stone-400 font-medium uppercase tracking-wide mb-1.5">
                  Testing Platforms ({crossRef.assays.length})
                </p>
                <div className="space-y-1">
                  {crossRef.assays.map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px]">
                      <span className="text-stone-700">{a.name}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-stone-400">{a.platform}</span>
                        {a.fdaApproved && <Badge className="bg-emerald-100 text-emerald-700 text-[8px] py-0">FDA</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* GWAS */}
            {crossRef.gwasVariants.length > 0 && (
              <div>
                <p className="text-[10px] text-stone-400 font-medium uppercase tracking-wide mb-1.5">
                  GWAS Variants ({crossRef.gwasVariants.length})
                </p>
                <div className="space-y-1">
                  {crossRef.gwasVariants.map((v, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px]">
                      <Badge variant="outline" className="font-mono text-[8px] py-0">{v.rsId}</Badge>
                      <span className="text-stone-700">{v.gene}</span>
                      <span className="text-stone-400 truncate">{v.trait}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PubMed */}
            {crossRef.pubmedArticles.length > 0 && (
              <div>
                <p className="text-[10px] text-stone-400 font-medium uppercase tracking-wide mb-1.5">
                  Publications ({crossRef.pubmedArticles.length})
                </p>
                <div className="space-y-1.5">
                  {crossRef.pubmedArticles.map((p, i) => (
                    <a key={i} href={`https://pubmed.ncbi.nlm.nih.gov/${p.pmid}`}
                      target="_blank" rel="noopener noreferrer"
                      className="block text-[10px] text-stone-700 hover:text-sky-700 leading-snug line-clamp-2">
                      {p.title}
                      <span className="text-stone-400 ml-1">{p.journal} · {p.pubDate}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <Sheet open={!!nctId} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-[700px] sm:max-w-[700px] p-0 overflow-hidden flex flex-col">
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-sky-500 animate-spin mx-auto mb-3" />
              <p className="text-sm text-stone-500">Loading trial intelligence...</p>
              <p className="text-xs text-stone-400">Cross-referencing 6 databases</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </div>
        )}

        {data && !loading && (
          <>
            {/* Header */}
            <SheetHeader className="px-5 pt-5 pb-3 border-b border-stone-200 bg-white shrink-0">
              <div className="flex items-start justify-between pr-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-sky-100 text-sky-800 font-mono text-xs">{data.trial.nctId}</Badge>
                    <Badge variant={data.trial.status === 'Recruiting' ? 'default' : 'outline'} className="text-[10px]">
                      {data.trial.status}
                    </Badge>
                    {data.trial.phase && <Badge variant="secondary" className="text-[10px]">{data.trial.phase}</Badge>}
                  </div>
                  <SheetTitle className="text-sm leading-snug line-clamp-2">{data.trial.briefTitle}</SheetTitle>
                  <SheetDescription className="text-[10px] mt-1">
                    {data.trial.sponsor} · {data.indications.map(i => i.displayName).join(', ')}
                  </SheetDescription>
                </div>
              </div>
              <a href={`https://clinicaltrials.gov/study/${data.trial.nctId}`}
                target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-sky-600 hover:underline flex items-center gap-0.5 mt-1">
                View on ClinicalTrials.gov <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </SheetHeader>

            {/* Scrollable body */}
            <ScrollArea className="flex-1">
              <div className="px-5 py-4 space-y-3">

                {/* KPI row */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Enrollment', value: data.trial.enrollmentCount || '-', icon: Users },
                    { label: 'Start', value: data.trial.startDate?.substring(0, 7) || '-', icon: Calendar },
                    { label: 'Biomarkers', value: data.biomarkers.length, icon: Target },
                    { label: 'Sponsor', value: data.trial.sponsorClass || '-', icon: Building2 },
                  ].map((stat, i) => (
                    <div key={i} className="p-2 bg-stone-50 rounded-lg text-center">
                      <stat.icon className="w-3.5 h-3.5 text-stone-400 mx-auto mb-1" />
                      <p className="text-sm font-bold tabular-nums">{stat.value}</p>
                      <p className="text-[9px] text-stone-400">{stat.label}</p>
                    </div>
                  ))}
                </div>

                {/* TRIAL OVERVIEW */}
                <div>
                  <SectionHeader id="overview" icon={ClipboardList} title="Trial Overview" color="text-sky-600" />
                  {expandedSections.has('overview') && (
                    <div className="pl-6 space-y-3">
                      {/* Study Design */}
                      {(data.trial.allocation || data.trial.masking || data.trial.primaryPurpose) && (
                        <div className="grid grid-cols-2 gap-2">
                          {data.trial.studyType && (
                            <div><span className="text-[10px] text-stone-400">Study Type</span><p className="text-xs text-stone-700">{data.trial.studyType}</p></div>
                          )}
                          {data.trial.allocation && (
                            <div><span className="text-[10px] text-stone-400">Allocation</span><p className="text-xs text-stone-700">{data.trial.allocation}</p></div>
                          )}
                          {data.trial.masking && (
                            <div><span className="text-[10px] text-stone-400">Masking</span><p className="text-xs text-stone-700">{data.trial.masking}</p></div>
                          )}
                          {data.trial.primaryPurpose && (
                            <div><span className="text-[10px] text-stone-400">Primary Purpose</span><p className="text-xs text-stone-700">{data.trial.primaryPurpose}</p></div>
                          )}
                          {data.trial.interventionModel && (
                            <div><span className="text-[10px] text-stone-400">Design</span><p className="text-xs text-stone-700">{data.trial.interventionModel}</p></div>
                          )}
                        </div>
                      )}

                      {/* Eligibility */}
                      {(data.trial.minimumAge || data.trial.maximumAge || data.trial.sex) && (
                        <div className="flex items-center gap-3 text-xs text-stone-600">
                          {data.trial.minimumAge && <span>Age: {data.trial.minimumAge}</span>}
                          {data.trial.maximumAge && <span>– {data.trial.maximumAge}</span>}
                          {data.trial.sex && <span>· Sex: {data.trial.sex}</span>}
                        </div>
                      )}

                      {/* Conditions */}
                      {data.trial.conditions.length > 0 && (
                        <div>
                          <span className="text-[10px] text-stone-400">Conditions</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {data.trial.conditions.slice(0, 8).map((c, i) => (
                              <Badge key={i} variant="outline" className="text-[9px]">{String(c)}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Brief summary */}
                      {data.trial.briefSummary && (
                        <div>
                          <span className="text-[10px] text-stone-400">Summary</span>
                          <p className="text-[11px] text-stone-600 leading-relaxed mt-0.5 line-clamp-4">
                            {data.trial.briefSummary}
                          </p>
                        </div>
                      )}

                      {/* Interventions */}
                      {Array.isArray(data.trial.interventions) && data.trial.interventions.length > 0 && (
                        <div>
                          <span className="text-[10px] text-stone-400">Interventions</span>
                          <div className="space-y-1 mt-0.5">
                            {data.trial.interventions.slice(0, 5).map((intv: unknown, i: number) => {
                              const iv = intv as Record<string, string> | null
                              return iv ? (
                                <div key={i} className="text-[11px] text-stone-600">
                                  <span className="font-medium">{iv.type || iv.interventionType || ''}: </span>
                                  {iv.name || iv.interventionName || JSON.stringify(iv).substring(0, 100)}
                                </div>
                              ) : null
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <Separator />

                {/* BIOMARKER USAGE */}
                <div>
                  <SectionHeader id="biomarkers" icon={Target} title="Biomarker Usage" count={data.biomarkers.length} color="text-orange-600" />
                  {expandedSections.has('biomarkers') && (
                    <div className="pl-6 space-y-2">
                      {data.biomarkers.map((bm, i) => (
                        <Card key={i} className="border-stone-200">
                          <CardContent className="py-2.5 px-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-stone-900">{bm.biomarkerName}</span>
                                {bm.biomarkerRole && (
                                  <Badge variant={bm.biomarkerRole === 'inclusion' ? 'default' : bm.biomarkerRole === 'exclusion' ? 'destructive' : 'secondary'}
                                    className="text-[8px] py-0">
                                    {bm.biomarkerRole}
                                  </Badge>
                                )}
                                {bm.companionDiagnostic && (
                                  <Badge className="bg-emerald-100 text-emerald-700 text-[8px] py-0">CDx</Badge>
                                )}
                              </div>
                              {bm.therapeuticSetting && (
                                <Badge variant="outline" className="text-[8px] py-0">{bm.therapeuticSetting}</Badge>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[10px]">
                              <div>
                                <span className="text-stone-400">Cutoff</span>
                                <p className="text-stone-700 font-mono">
                                  {bm.cutoffOperator && bm.cutoffOperator !== 'positive' && bm.cutoffOperator !== 'negative'
                                    ? bm.cutoffOperator : ''}{bm.cutoffValue || '-'} {bm.cutoffUnit || ''}
                                </p>
                              </div>
                              <div>
                                <span className="text-stone-400">Assay</span>
                                <p className="text-stone-700">{bm.assayName || '-'}</p>
                              </div>
                              <div>
                                <span className="text-stone-400">Platform</span>
                                <p className="text-stone-700">{bm.assayPlatform || '-'}</p>
                              </div>
                            </div>
                            {/* Extraction confidence */}
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[9px] text-stone-400">Confidence</span>
                              <Progress value={bm.extractionConfidence * 100} className="h-1 flex-1" />
                              <span className="text-[9px] text-stone-500 tabular-nums">{(bm.extractionConfidence * 100).toFixed(0)}%</span>
                              {bm.extractionSource && (
                                <span className="text-[9px] text-stone-400">from {bm.extractionSource}</span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {data.biomarkers.length === 0 && (
                        <p className="text-xs text-stone-400 py-2">No biomarkers extracted for this trial.</p>
                      )}
                    </div>
                  )}
                </div>

                <Separator />

                {/* CROSS-REFERENCE INTELLIGENCE */}
                <div>
                  <SectionHeader id="crossrefs" icon={Dna} title="Cross-Reference Intelligence" color="text-purple-600" />
                  {expandedSections.has('crossrefs') && (
                    <div className="pl-6 space-y-2">
                      <p className="text-[10px] text-stone-400 mb-2">
                        For each biomarker × indication, cross-references Open Targets, GWAS, PubMed, and assay databases.
                      </p>
                      {Object.entries(data.crossReferences).map(([key, crossRef]) => (
                        <CrossRefSection key={key} refKey={key} crossRef={crossRef} />
                      ))}
                      {Object.keys(data.crossReferences).length === 0 && (
                        <p className="text-xs text-stone-400 py-2">No cross-reference data available.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Expand cross-refs by default if collapsed */}
                {!expandedSections.has('crossrefs') && Object.keys(data.crossReferences).length > 0 && (
                  <button
                    onClick={() => toggleSection('crossrefs')}
                    className="w-full text-center text-xs text-sky-600 hover:text-sky-700 py-1"
                  >
                    Show cross-database intelligence ({Object.keys(data.crossReferences).length} pairs)
                  </button>
                )}

                {/* Source footer */}
                <div className="text-[9px] text-stone-400 text-center pt-2 pb-4">
                  Data: ClinicalTrials.gov · Open Targets · GWAS Catalog · PubMed · FDA CDx Registry
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
