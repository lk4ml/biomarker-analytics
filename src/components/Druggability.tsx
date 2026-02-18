/**
 * Druggability Dashboard — powered by Open Targets Platform data.
 * Shows biomarker druggability matrix, known drugs, and cancer biomarker evidence.
 */
import React, { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Loader2, ChevronDown, ChevronRight, ExternalLink, Pill, FlaskConical,
  Target, ShieldCheck, Beaker, AlertCircle
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { DruggabilityRow, KnownDrug, CancerBiomarkerEvidence } from '@/services/api-client'
import { getDruggabilityMatrix, getDrugsForBiomarker, getCancerBiomarkerEvidence } from '@/services/api-client'


function TractabilityIcon({ approved, tractable }: { approved: boolean; tractable: boolean }) {
  if (approved) return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold" title="Approved Drug">✓</span>
  if (tractable) return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold" title="Tractable">○</span>
  return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-400 text-xs" title="Not tractable">—</span>
}


function ScoreBar({ score, color = '#0ea5e9' }: { score: number; color?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-2 bg-stone-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(score * 100, 2)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] text-stone-500 tabular-nums w-8">{(score * 100).toFixed(0)}%</span>
    </div>
  )
}


function ConfidenceBadge({ confidence }: { confidence: string }) {
  const color =
    confidence === 'FDA guidelines' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
    confidence === 'NCCN guidelines' || confidence === 'NCCN/CAP guidelines' ? 'bg-blue-100 text-blue-800 border-blue-300' :
    confidence === 'European LeukemiaNet guidelines' ? 'bg-blue-100 text-blue-800 border-blue-300' :
    confidence === 'Late trials' ? 'bg-sky-100 text-sky-800 border-sky-300' :
    confidence === 'Early trials' ? 'bg-amber-100 text-amber-800 border-amber-300' :
    confidence === 'Case report' ? 'bg-orange-100 text-orange-800 border-orange-300' :
    'bg-stone-100 text-stone-600 border-stone-300'
  return <Badge variant="outline" className={`text-[10px] ${color}`}>{confidence}</Badge>
}


interface Props {
  indication: string
}


export default function Druggability({ indication }: Props) {
  const [matrix, setMatrix] = useState<DruggabilityRow[]>([])
  const [evidence, setEvidence] = useState<CancerBiomarkerEvidence[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedBiomarker, setExpandedBiomarker] = useState<string | null>(null)
  const [drugs, setDrugs] = useState<KnownDrug[]>([])
  const [drugsLoading, setDrugsLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getDruggabilityMatrix(indication),
      getCancerBiomarkerEvidence(indication),
    ]).then(([m, e]) => {
      setMatrix(m)
      setEvidence(e)
    }).catch(err => console.error('Druggability fetch error:', err))
      .finally(() => setLoading(false))
  }, [indication])

  // When a biomarker row is expanded, fetch its drugs
  useEffect(() => {
    if (!expandedBiomarker) { setDrugs([]); return }
    setDrugsLoading(true)
    getDrugsForBiomarker(indication, expandedBiomarker)
      .then(d => setDrugs(d))
      .catch(err => console.error('Drugs fetch error:', err))
      .finally(() => setDrugsLoading(false))
  }, [expandedBiomarker, indication])

  // Score chart data — top 10 by overall score
  const scoreChartData = useMemo(() =>
    matrix.slice(0, 12).map(r => ({
      name: r.biomarkerSymbol,
      overall: +(r.overallScore * 100).toFixed(0),
      drugs: +(r.drugScore * 100).toFixed(0),
      cancerBm: +(r.cancerBiomarkerScore * 100).toFixed(0),
    }))
  , [matrix])

  // Evidence grouped by confidence
  const evidenceByConfidence = useMemo(() => {
    const groups: Record<string, CancerBiomarkerEvidence[]> = {}
    evidence.forEach(e => {
      const c = e.confidence || 'Unknown'
      if (!groups[c]) groups[c] = []
      groups[c].push(e)
    })
    return groups
  }, [evidence])

  if (loading) {
    return (
      <Card className="border-stone-200">
        <CardContent className="py-12 text-center">
          <Loader2 className="w-8 h-8 text-stone-300 mx-auto mb-3 animate-spin" />
          <p className="text-sm text-stone-500">Loading druggability data from Open Targets...</p>
        </CardContent>
      </Card>
    )
  }

  if (matrix.length === 0) {
    return (
      <Card className="border-stone-200">
        <CardContent className="py-12 text-center">
          <AlertCircle className="w-8 h-8 text-stone-300 mx-auto mb-3" />
          <p className="text-sm text-stone-500">No druggability data available for {indication}.</p>
          <p className="text-xs text-stone-400 mt-1">Run the Open Targets pipeline to populate this data.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-stone-200">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-sky-600 opacity-60" />
              <div>
                <p className="text-xl font-bold">{matrix.length}</p>
                <p className="text-xs text-stone-500">Targets Profiled</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Pill className="w-5 h-5 text-emerald-600 opacity-60" />
              <div>
                <p className="text-xl font-bold">{matrix.filter(r => r.smHasApprovedDrug || r.abHasApprovedDrug).length}</p>
                <p className="text-xs text-stone-500">With Approved Drugs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-orange-600 opacity-60" />
              <div>
                <p className="text-xl font-bold">{matrix.reduce((s, r) => s + r.uniqueDrugs, 0)}</p>
                <p className="text-xs text-stone-500">Total Drug Candidates</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-purple-600 opacity-60" />
              <div>
                <p className="text-xl font-bold">{evidence.filter(e => e.confidence === 'FDA guidelines').length}</p>
                <p className="text-xs text-stone-500">FDA Guideline Evidence</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Score chart */}
      <Card className="border-stone-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Target–Disease Association Scores — {indication}</CardTitle>
          <CardDescription className="text-xs">Open Targets overall, drug, and cancer biomarker scores (0–100%)</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={scoreChartData} margin={{ left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="overall" name="Overall" fill="#0ea5e9" radius={[2, 2, 0, 0]} />
              <Bar dataKey="drugs" name="Drug Evidence" fill="#22c55e" radius={[2, 2, 0, 0]} />
              <Bar dataKey="cancerBm" name="Cancer Biomarker" fill="#a855f7" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Main druggability matrix */}
      <Card className="border-stone-200">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Biomarker Druggability Matrix — {indication}</CardTitle>
              <CardDescription className="text-xs">
                Tractability, drug pipeline, and evidence scores from Open Targets Platform
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-stone-400">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-emerald-100 border border-emerald-300" /> Approved Drug</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-amber-100 border border-amber-300" /> Tractable</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-stone-100 border border-stone-300" /> Not Tractable</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="w-8" />
                  <TableHead className="w-24">Biomarker</TableHead>
                  <TableHead className="w-24">OT Score</TableHead>
                  <TableHead className="w-16 text-center">SM</TableHead>
                  <TableHead className="w-16 text-center">mAb</TableHead>
                  <TableHead className="w-16 text-center">PROTAC</TableHead>
                  <TableHead className="w-16 text-center">Drugs</TableHead>
                  <TableHead className="w-20">Drug Score</TableHead>
                  <TableHead className="w-20">Cancer BM</TableHead>
                  <TableHead className="w-20">CGC</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrix.map(row => (
                  <React.Fragment key={row.biomarkerSymbol}>
                    <TableRow
                      className={`text-xs cursor-pointer hover:bg-stone-50 transition-colors ${expandedBiomarker === row.biomarkerSymbol ? 'bg-sky-50' : ''}`}
                      onClick={() => setExpandedBiomarker(expandedBiomarker === row.biomarkerSymbol ? null : row.biomarkerSymbol)}
                    >
                      <TableCell className="pr-0">
                        {expandedBiomarker === row.biomarkerSymbol
                          ? <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
                          : <ChevronRight className="w-3.5 h-3.5 text-stone-400" />}
                      </TableCell>
                      <TableCell className="font-semibold text-stone-900">{row.biomarkerSymbol}</TableCell>
                      <TableCell><ScoreBar score={row.overallScore} /></TableCell>
                      <TableCell className="text-center"><TractabilityIcon approved={row.smHasApprovedDrug} tractable={row.smTractable} /></TableCell>
                      <TableCell className="text-center"><TractabilityIcon approved={row.abHasApprovedDrug} tractable={row.abTractable} /></TableCell>
                      <TableCell className="text-center"><TractabilityIcon approved={false} tractable={row.protacTractable} /></TableCell>
                      <TableCell className="text-center">
                        <span className="text-xs font-medium">{row.uniqueDrugs}</span>
                      </TableCell>
                      <TableCell><ScoreBar score={row.drugScore} color="#22c55e" /></TableCell>
                      <TableCell><ScoreBar score={row.cancerBiomarkerScore} color="#a855f7" /></TableCell>
                      <TableCell><ScoreBar score={row.cancerGeneCensusScore} color="#f97316" /></TableCell>
                    </TableRow>
                    {/* Expanded row: drug details */}
                    {expandedBiomarker === row.biomarkerSymbol && (
                      <TableRow key={`${row.biomarkerSymbol}-expanded`} className="bg-sky-50/50">
                        <TableCell colSpan={10} className="p-0">
                          <div className="px-8 py-3 border-t border-sky-100">
                            {drugsLoading ? (
                              <div className="flex items-center gap-2 text-xs text-stone-400 py-4">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading drugs...
                              </div>
                            ) : drugs.length > 0 ? (
                              <div>
                                <p className="text-xs font-medium text-stone-700 mb-2">
                                  Known Drugs for {row.biomarkerSymbol} ({drugs.length} drugs)
                                </p>
                                <div className="grid grid-cols-1 gap-1 max-h-60 overflow-y-auto">
                                  {drugs.slice(0, 20).map((d, i) => (
                                    <div key={`${d.drugName}-${i}`} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-white text-xs">
                                      <div className="flex items-center gap-2 w-52">
                                        {d.isApproved ? (
                                          <Badge className="bg-emerald-100 text-emerald-700 text-[9px] px-1.5">Approved</Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-[9px] px-1.5">Phase {d.maxPhase}</Badge>
                                        )}
                                        <span className="font-medium text-stone-900 truncate">{d.drugName}</span>
                                      </div>
                                      <Badge variant="secondary" className="text-[9px]">{d.drugType}</Badge>
                                      {d.yearApproved && <span className="text-stone-400 text-[10px]">{d.yearApproved}</span>}
                                      <span className="text-stone-500 text-[10px] truncate flex-1">{d.mechanismOfAction}</span>
                                      <span className="text-stone-400 text-[10px] truncate max-w-48">{d.diseaseName}</span>
                                    </div>
                                  ))}
                                  {drugs.length > 20 && (
                                    <p className="text-[10px] text-stone-400 px-2 py-1">+ {drugs.length - 20} more drugs</p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-stone-400 py-2">No drug data available for this biomarker in {indication}.</p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Cancer biomarker evidence */}
      <Card className="border-stone-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Cancer Biomarker Evidence — {indication}</CardTitle>
          <CardDescription className="text-xs">
            Drug sensitivity/resistance evidence from Cancer Genome Interpreter via Open Targets ({evidence.length} records)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(evidenceByConfidence).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(evidenceByConfidence).map(([conf, items]) => (
                <div key={conf}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <ConfidenceBadge confidence={conf} />
                    <span className="text-[10px] text-stone-400">{items.length} records</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 ml-1">
                    {items.map((ev, i) => (
                      <div key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-stone-50 rounded text-[11px] text-stone-700 border border-stone-100">
                        <span className="font-medium">{ev.biomarkerSymbol}</span>
                        {ev.drugName && (
                          <>
                            <span className="text-stone-300">+</span>
                            <span className="text-sky-700">{ev.drugName}</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-stone-400 text-center py-6">No cancer biomarker evidence found.</p>
          )}
        </CardContent>
      </Card>

      {/* Data source attribution */}
      <div className="flex items-center justify-between text-[10px] text-stone-400 px-1">
        <span>Data source: Open Targets Platform (api.platform.opentargets.org)</span>
        <a href="https://platform.opentargets.org" target="_blank" rel="noopener noreferrer" className="hover:text-stone-600 flex items-center gap-0.5">
          Open Targets Platform <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </div>
  )
}
