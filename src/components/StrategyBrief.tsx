import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
  AreaChart, Area, Cell
} from 'recharts'
import {
  FlaskConical, Loader2, Dna, Newspaper, Pill,
  TestTube2, Shield, TrendingUp, Building2,
  ExternalLink, Zap, CheckCircle2, XCircle, AlertCircle,
  FileText, Target, ChevronRight
} from 'lucide-react'
import { getStrategyBrief, getBiomarkers, type StrategyBrief as StrategyBriefType } from '../services/api-client'

const COLORS = ['#0ea5e9', '#f97316', '#22c55e', '#a855f7', '#ef4444', '#eab308', '#06b6d4', '#ec4899']

const EVIDENCE_COLORS: Record<string, string> = {
  'FDA guidelines': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'NCCN guidelines': 'bg-blue-100 text-blue-800 border-blue-300',
  'NCCN/CAP guidelines': 'bg-sky-100 text-sky-800 border-sky-300',
  'European LeukemiaNet guidelines': 'bg-indigo-100 text-indigo-800 border-indigo-300',
  'Late trials': 'bg-amber-100 text-amber-800 border-amber-300',
  'Early trials': 'bg-orange-100 text-orange-800 border-orange-300',
  'Clinical trials': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'Case report': 'bg-stone-100 text-stone-700 border-stone-300',
  'Pre-clinical': 'bg-stone-50 text-stone-500 border-stone-200',
}

interface Props {
  indication: string
}

export default function StrategyBrief({ indication }: Props) {
  const [brief, setBrief] = useState<StrategyBriefType | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedBiomarker, setSelectedBiomarker] = useState<string>('')
  const [biomarkers, setBiomarkers] = useState<string[]>([])
  const [biomarkersLoading, setBiomarkersLoading] = useState(true)

  // Load available biomarkers
  useEffect(() => {
    setBiomarkersLoading(true)
    getBiomarkers()
      .then(bms => {
        const names = bms.map(b => b.name).sort()
        setBiomarkers(names)
        setBiomarkersLoading(false)
      })
      .catch(() => {
        setBiomarkers(['PD-L1', 'EGFR', 'KRAS', 'HER2', 'BRAF', 'ALK', 'BRCA1/2', 'MSI', 'TMB', 'NTRK', 'PIK3CA', 'RET', 'ROS1', 'MET', 'ER', 'PR', 'Ki-67', 'ctDNA', 'TILs'])
        setBiomarkersLoading(false)
      })
  }, [])

  // Reset brief when indication changes
  useEffect(() => {
    setBrief(null)
    setError(null)
  }, [indication])

  const generateBrief = async () => {
    if (!selectedBiomarker) return
    setLoading(true)
    setError(null)
    try {
      const data = await getStrategyBrief(indication, selectedBiomarker)
      setBrief(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate brief')
    } finally {
      setLoading(false)
    }
  }

  // Score bar helper
  const ScoreBar = ({ label, value, max = 1 }: { label: string; value: number; max?: number }) => (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-stone-500 w-28 text-right shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${(value / max) * 100}%`,
            backgroundColor: value / max > 0.7 ? '#22c55e' : value / max > 0.4 ? '#eab308' : value / max > 0 ? '#ef4444' : '#e7e5e4'
          }}
        />
      </div>
      <span className="text-[10px] text-stone-600 w-10 tabular-nums">{(value * 100).toFixed(0)}%</span>
    </div>
  )

  // Tractability badge
  const TractBadge = ({ tractable, approved, label }: { tractable: boolean; approved: boolean; label: string }) => (
    <div className="flex items-center gap-1.5">
      {approved ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
      ) : tractable ? (
        <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-stone-300" />
      )}
      <span className={`text-xs ${approved ? 'text-emerald-700 font-medium' : tractable ? 'text-amber-700' : 'text-stone-400'}`}>
        {label}: {approved ? 'Approved Drug' : tractable ? 'Tractable' : 'Not tractable'}
      </span>
    </div>
  )

  if (!brief) {
    return (
      <div className="space-y-4">
        <Card className="border-stone-200">
          <CardContent className="pt-6 pb-8">
            <div className="max-w-lg mx-auto text-center">
              <div className="w-14 h-14 bg-sky-50 rounded-xl flex items-center justify-center mx-auto mb-4">
                <FileText className="w-7 h-7 text-sky-600" />
              </div>
              <h2 className="text-lg font-bold text-stone-900 mb-2">Biomarker Strategy Brief</h2>
              <p className="text-sm text-stone-500 mb-6">
                Generate a cross-database intelligence report for a specific biomarker in <span className="font-semibold text-stone-700">{indication}</span>.
                Joins data from ClinicalTrials.gov, Open Targets, PubMed, GWAS Catalog, and assay databases.
              </p>

              <div className="flex items-center gap-3 justify-center">
                <div className="w-52">
                  {biomarkersLoading ? (
                    <div className="flex items-center gap-2 h-10 px-3 border border-stone-200 rounded-md text-sm text-stone-400">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                    </div>
                  ) : (
                    <Select value={selectedBiomarker} onValueChange={setSelectedBiomarker}>
                      <SelectTrigger className="h-10 text-sm">
                        <SelectValue placeholder="Select biomarker..." />
                      </SelectTrigger>
                      <SelectContent>
                        {biomarkers.map(b => (
                          <SelectItem key={b} value={b}>{b}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <Button
                  onClick={generateBrief}
                  disabled={!selectedBiomarker || loading}
                  className="h-10"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                  ) : (
                    <>Generate Brief <ChevronRight className="w-4 h-4 ml-1" /></>
                  )}
                </Button>
              </div>

              {error && (
                <p className="text-sm text-red-600 mt-4">{error}</p>
              )}

              <div className="mt-8 grid grid-cols-3 gap-4 text-left">
                {[
                  { icon: FlaskConical, label: 'Clinical Trials', desc: 'Trial counts, phases, sponsors, year trends' },
                  { icon: Pill, label: 'Druggability', desc: 'Approved drugs, pipeline, tractability' },
                  { icon: Shield, label: 'Evidence', desc: 'FDA, NCCN guidelines, clinical evidence' },
                  { icon: TestTube2, label: 'Assay Landscape', desc: 'CDx status, assay platforms' },
                  { icon: Dna, label: 'Genetic Context', desc: 'GWAS variants, gene symbols' },
                  { icon: Newspaper, label: 'Publications', desc: 'Recent PubMed literature' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-stone-50">
                    <item.icon className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-stone-800">{item.label}</p>
                      <p className="text-[10px] text-stone-400">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ===== BRIEF GENERATED — Full report view =====
  const b = brief
  return (
    <div className="space-y-4">
      {/* Header + regenerate */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-stone-900">{b.biomarker}</h2>
            <span className="text-stone-400">in</span>
            <h2 className="text-lg font-bold text-stone-900">{b.indication}</h2>
          </div>
          <p className="text-xs text-stone-400">
            Generated {new Date(b.generatedAt).toLocaleDateString()} · Cross-database intelligence from 6 sources
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedBiomarker} onValueChange={setSelectedBiomarker}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {biomarkers.map(bm => (
                <SelectItem key={bm} value={bm}>{bm}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={generateBrief} disabled={loading} className="h-8 text-xs">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Regenerate'}
          </Button>
        </div>
      </div>

      {/* Summary KPI cards */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: 'Total Trials', value: b.trialSummary.total, icon: FlaskConical, color: 'text-sky-600' },
          { label: 'Recruiting', value: b.trialSummary.recruiting, icon: TrendingUp, color: 'text-emerald-600' },
          { label: 'Approved Drugs', value: b.druggability.totalApproved, icon: Pill, color: 'text-purple-600' },
          { label: 'Drug Candidates', value: b.druggability.totalDrugCandidates, icon: Target, color: 'text-orange-600' },
          { label: 'Evidence Records', value: b.evidence.total, icon: Shield, color: 'text-blue-600' },
          { label: 'OT Score', value: `${(b.druggability.overallScore * 100).toFixed(0)}%`, icon: Zap, color: 'text-amber-600' },
        ].map((stat, i) => (
          <Card key={i} className="border-stone-200">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xl font-bold tabular-nums">{typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}</p>
                  <p className="text-[10px] text-stone-400">{stat.label}</p>
                </div>
                <stat.icon className={`w-5 h-5 ${stat.color} opacity-50`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* ── CLINICAL LANDSCAPE ── */}
        <Card className="border-stone-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <FlaskConical className="w-4 h-4 text-sky-600" />
              Clinical Landscape
            </CardTitle>
            <CardDescription className="text-xs">
              {b.trialSummary.firstTrialYear && b.trialSummary.latestTrialYear
                ? `${b.trialSummary.firstTrialYear}–${b.trialSummary.latestTrialYear}`
                : 'All years'} · {b.trialSummary.total} trials
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Phase breakdown */}
            {b.trialSummary.byPhase.length > 0 && (
              <div>
                <p className="text-[10px] text-stone-400 mb-1.5 font-medium uppercase tracking-wide">By Phase</p>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={b.trialSummary.byPhase} layout="vertical" margin={{ left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="phase" type="category" tick={{ fontSize: 9 }} width={65} />
                    <RechartsTooltip contentStyle={{ fontSize: 11 }} />
                    <Bar dataKey="count" name="Trials" radius={[0, 3, 3, 0]}>
                      {b.trialSummary.byPhase.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Year trend */}
            {b.trialSummary.yearTrend.length > 0 && (
              <div>
                <p className="text-[10px] text-stone-400 mb-1.5 font-medium uppercase tracking-wide">Year Trend</p>
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={b.trialSummary.yearTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                    <XAxis dataKey="year" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <RechartsTooltip contentStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="count" fill="#0ea5e9" fillOpacity={0.15} stroke="#0ea5e9" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top sponsors */}
            {b.trialSummary.topSponsors.length > 0 && (
              <div>
                <p className="text-[10px] text-stone-400 mb-1.5 font-medium uppercase tracking-wide">Top Sponsors</p>
                <div className="space-y-1">
                  {b.trialSummary.topSponsors.slice(0, 7).map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3 h-3 text-stone-300" />
                        <span className="text-stone-700 truncate max-w-[200px]">{s.name}</span>
                      </div>
                      <span className="text-stone-500 tabular-nums font-medium">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── DRUGGABILITY ── */}
        <Card className="border-stone-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Pill className="w-4 h-4 text-purple-600" />
              Druggability & Pipeline
            </CardTitle>
            <CardDescription className="text-xs">
              Open Targets scores, tractability, approved & pipeline drugs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Scores */}
            <div className="space-y-1.5">
              <ScoreBar label="Overall" value={b.druggability.overallScore} />
              <ScoreBar label="Known Drugs" value={b.druggability.drugScore} />
              <ScoreBar label="Cancer Biomarker" value={b.druggability.cancerBiomarkerScore} />
              <ScoreBar label="Cancer Gene Census" value={b.druggability.cancerGeneCensusScore} />
              <ScoreBar label="Literature" value={b.druggability.literatureScore} />
            </div>

            <Separator />

            {/* Tractability */}
            <div className="space-y-1.5">
              <p className="text-[10px] text-stone-400 font-medium uppercase tracking-wide">Tractability</p>
              <TractBadge tractable={b.druggability.smTractable} approved={b.druggability.smHasApprovedDrug} label="Small Molecule" />
              <TractBadge tractable={b.druggability.abTractable} approved={b.druggability.abHasApprovedDrug} label="Antibody" />
              <TractBadge tractable={b.druggability.protacTractable} approved={false} label="PROTAC" />
            </div>

            <Separator />

            {/* Approved drugs */}
            {b.druggability.approvedDrugs.length > 0 && (
              <div>
                <p className="text-[10px] text-stone-400 mb-1.5 font-medium uppercase tracking-wide">
                  Approved Drugs ({b.druggability.approvedDrugs.length})
                </p>
                <ScrollArea className="max-h-[200px]">
                  <div className="space-y-1.5">
                    {b.druggability.approvedDrugs.map((d, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-emerald-50 rounded text-xs border border-emerald-100">
                        <div>
                          <span className="font-semibold text-emerald-800">{d.name}</span>
                          <span className="text-emerald-600 ml-2">{d.type}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {d.yearApproved && <span className="text-[10px] text-emerald-500">{d.yearApproved}</span>}
                          <Badge className="bg-emerald-100 text-emerald-700 text-[9px] border-emerald-200">Approved</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Pipeline drugs */}
            {b.druggability.pipelineDrugs.length > 0 && (
              <div>
                <p className="text-[10px] text-stone-400 mb-1.5 font-medium uppercase tracking-wide">
                  Pipeline (Phase 2+): {b.druggability.pipelineDrugs.length}
                </p>
                <ScrollArea className="max-h-[120px]">
                  <div className="space-y-1">
                    {b.druggability.pipelineDrugs.slice(0, 8).map((d, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1">
                        <span className="text-stone-700">{d.name}</span>
                        <Badge variant="outline" className="text-[9px]">Phase {d.phase}</Badge>
                      </div>
                    ))}
                    {b.druggability.pipelineDrugs.length > 8 && (
                      <p className="text-[10px] text-stone-400">+ {b.druggability.pipelineDrugs.length - 8} more</p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Second row: Cutoff + Evidence */}
      <div className="grid grid-cols-2 gap-4">
        {/* ── CUTOFF & TESTING ── */}
        <Card className="border-stone-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-amber-600" />
              Cutoff & Testing Landscape
            </CardTitle>
            <CardDescription className="text-xs">
              Dominant cutoffs, assays used, companion diagnostics
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Dominant cutoffs */}
            {b.cutoffLandscape.dominantCutoffs.length > 0 ? (
              <div>
                <p className="text-[10px] text-stone-400 mb-1.5 font-medium uppercase tracking-wide">Dominant Cutoffs</p>
                <div className="space-y-1">
                  {b.cutoffLandscape.dominantCutoffs.slice(0, 6).map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded bg-stone-50">
                      <span className="font-mono text-stone-700">
                        {c.operator && c.operator !== 'positive' && c.operator !== 'negative' ? c.operator : ''}
                        {c.value} {c.unit}
                      </span>
                      <span className="text-stone-500 tabular-nums">{c.count} trials</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-stone-400 py-2">No specific cutoff values recorded</p>
            )}

            {/* Assays used */}
            {b.cutoffLandscape.assaysUsed.length > 0 && (
              <div>
                <p className="text-[10px] text-stone-400 mb-1.5 font-medium uppercase tracking-wide">Assays Used in Trials</p>
                <div className="space-y-1">
                  {b.cutoffLandscape.assaysUsed.slice(0, 5).map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-stone-700">{a.name}</span>
                      <span className="text-stone-500 tabular-nums">{a.count} trials</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Companion Diagnostics */}
            <div>
              <p className="text-[10px] text-stone-400 mb-1.5 font-medium uppercase tracking-wide">FDA-Approved CDx</p>
              {b.cutoffLandscape.companionDiagnostics.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {b.cutoffLandscape.companionDiagnostics.map((cdx, i) => (
                    <Badge key={i} className="bg-emerald-100 text-emerald-700 text-[10px] border-emerald-200">{cdx}</Badge>
                  ))}
                </div>
              ) : (
                <Badge variant="outline" className="text-[10px] text-stone-400">No FDA-approved CDx for this biomarker</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── EVIDENCE ── */}
        <Card className="border-stone-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-blue-600" />
              Cancer Biomarker Evidence
            </CardTitle>
            <CardDescription className="text-xs">
              {b.evidence.total} evidence records from Open Targets Cancer Biomarkers
            </CardDescription>
          </CardHeader>
          <CardContent>
            {b.evidence.total > 0 ? (
              <ScrollArea className="max-h-[350px]">
                <div className="space-y-3">
                  {Object.entries(b.evidence.byLevel).map(([level, items]) => (
                    <div key={level}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge className={`text-[10px] border ${EVIDENCE_COLORS[level] || 'bg-stone-100 text-stone-600 border-stone-200'}`}>
                          {level}
                        </Badge>
                        <span className="text-[10px] text-stone-400">{items.length} record{items.length > 1 ? 's' : ''}</span>
                      </div>
                      <div className="space-y-1 ml-2">
                        {items.map((item, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-stone-600 py-0.5">
                            <ChevronRight className="w-3 h-3 text-stone-300 shrink-0" />
                            <span>
                              {item.drug && <span className="font-medium text-stone-800">{item.drug}</span>}
                              {item.drug && item.disease && <span className="text-stone-400"> — </span>}
                              {item.disease && <span>{item.disease}</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-8">
                <Shield className="w-8 h-8 text-stone-200 mx-auto mb-2" />
                <p className="text-xs text-stone-400">No cancer biomarker evidence records found for this combination.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Third row: Assay Landscape + Genetic Context */}
      <div className="grid grid-cols-2 gap-4">
        {/* ── ASSAY LANDSCAPE ── */}
        <Card className="border-stone-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <TestTube2 className="w-4 h-4 text-teal-600" />
              Assay Landscape
            </CardTitle>
            <CardDescription className="text-xs">
              {b.assayLandscape.fdaApproved.length} FDA-approved, {b.assayLandscape.researchUse.length} research-use platforms
            </CardDescription>
          </CardHeader>
          <CardContent>
            {b.assayLandscape.fdaApproved.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] text-stone-400 mb-1.5 font-medium uppercase tracking-wide">FDA-Approved</p>
                <div className="space-y-1.5">
                  {b.assayLandscape.fdaApproved.map((a, i) => (
                    <div key={i} className="p-2 bg-emerald-50 rounded border border-emerald-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-emerald-800">{a.name}</span>
                        <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">FDA</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-emerald-600">
                        <span>{a.manufacturer}</span>
                        <span>·</span>
                        <span>{a.platform}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {b.assayLandscape.researchUse.length > 0 && (
              <div>
                <p className="text-[10px] text-stone-400 mb-1.5 font-medium uppercase tracking-wide">Research Use Only</p>
                <div className="space-y-1">
                  {b.assayLandscape.researchUse.map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-stone-50 last:border-0">
                      <span className="text-stone-700">{a.name}</span>
                      <span className="text-stone-400">{a.manufacturer} · {a.platform}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {b.assayLandscape.fdaApproved.length === 0 && b.assayLandscape.researchUse.length === 0 && (
              <div className="text-center py-6">
                <TestTube2 className="w-8 h-8 text-stone-200 mx-auto mb-2" />
                <p className="text-xs text-stone-400">No specific assay platforms catalogued for this biomarker.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── GENETIC CONTEXT ── */}
        <Card className="border-stone-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Dna className="w-4 h-4 text-rose-600" />
              Genetic Context (GWAS)
            </CardTitle>
            <CardDescription className="text-xs">
              Gene symbols: {b.geneticContext.geneSymbols.join(', ') || 'N/A'} · {b.geneticContext.gwasVariants.length} variants
            </CardDescription>
          </CardHeader>
          <CardContent>
            {b.geneticContext.gwasVariants.length > 0 ? (
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-2">
                  {b.geneticContext.gwasVariants.map((v, i) => (
                    <div key={i} className="p-2.5 border border-stone-200 rounded-md hover:border-stone-300 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-[10px]">{v.rsId}</Badge>
                          <span className="text-xs font-semibold text-rose-700">{v.gene}</span>
                        </div>
                        <span className="text-[10px] text-stone-400 tabular-nums">p = {Number(v.pValue).toExponential(1)}</span>
                      </div>
                      <p className="text-xs text-stone-700 mb-1">{v.trait}</p>
                      <div className="flex items-center gap-3 text-[10px] text-stone-400">
                        {v.oddsRatio && <span>OR: {v.oddsRatio}</span>}
                        <span>Risk: {v.riskAllele}</span>
                        <span>Pop: {v.population}</span>
                        {v.pubmedId && (
                          <a href={`https://pubmed.ncbi.nlm.nih.gov/${v.pubmedId}`} target="_blank" rel="noopener noreferrer"
                            className="text-sky-600 hover:underline flex items-center gap-0.5">
                            PMID:{v.pubmedId} <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-6">
                <Dna className="w-8 h-8 text-stone-200 mx-auto mb-2" />
                <p className="text-xs text-stone-400">
                  {b.geneticContext.geneSymbols.length === 0
                    ? 'No gene symbol mapping for this biomarker (may be a composite marker).'
                    : 'No GWAS associations found for this biomarker\'s gene(s).'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Publications */}
      {b.publications.length > 0 && (
        <Card className="border-stone-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Newspaper className="w-4 h-4 text-indigo-600" />
              Recent Publications
            </CardTitle>
            <CardDescription className="text-xs">
              {b.publications.length} PubMed articles mentioning {b.biomarker} in {b.indication}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {b.publications.map((p, i) => (
                <div key={i} className="p-2.5 border border-stone-200 rounded hover:border-stone-300 transition-colors">
                  <a href={`https://pubmed.ncbi.nlm.nih.gov/${p.pmid}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-medium text-stone-800 hover:text-sky-700 leading-snug line-clamp-2">
                    {p.title}
                  </a>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-stone-400">
                    {p.journal && <span>{p.journal}</span>}
                    {p.pubDate && <span>· {p.pubDate}</span>}
                    <span className="font-mono text-sky-600">PMID:{p.pmid}</span>
                  </div>
                  {p.authors.length > 0 && (
                    <p className="text-[10px] text-stone-400 mt-0.5 truncate">
                      {p.authors.join(', ')}{p.authors.length >= 3 ? ', et al.' : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Source attribution */}
      <div className="flex items-center justify-center gap-4 py-2 text-[10px] text-stone-400">
        <span>Data sources:</span>
        <span>ClinicalTrials.gov</span>
        <span>·</span>
        <span>Open Targets Platform</span>
        <span>·</span>
        <span>PubMed</span>
        <span>·</span>
        <span>GWAS Catalog</span>
        <span>·</span>
        <span>FDA/NCCN Guidelines</span>
      </div>
    </div>
  )
}
