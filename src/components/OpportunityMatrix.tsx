import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Loader2, Pill, TestTube2, Zap, TrendingUp,
  AlertCircle, CheckCircle2, ChevronRight, Grid3X3
} from 'lucide-react'
import { getOpportunityMatrix, type OpportunityMatrixData, type OpportunityCell } from '../services/api-client'

interface Props {
  indication: string
  onSelectBiomarkerIndication?: (biomarker: string, indication: string) => void
}

// Color scale for trial count heatmap
function getHeatmapColor(trials: number, maxTrials: number): string {
  if (trials === 0) return '#fafaf9' // stone-50
  const intensity = Math.min(trials / maxTrials, 1)
  // Gradient: very light sky -> sky-600
  if (intensity < 0.1) return '#e0f2fe' // sky-100
  if (intensity < 0.2) return '#bae6fd' // sky-200
  if (intensity < 0.35) return '#7dd3fc' // sky-300
  if (intensity < 0.5) return '#38bdf8' // sky-400
  if (intensity < 0.7) return '#0ea5e9' // sky-500
  return '#0284c7' // sky-600
}

function getTextColor(trials: number, maxTrials: number): string {
  if (trials === 0) return '#a8a29e' // stone-400
  const intensity = Math.min(trials / maxTrials, 1)
  return intensity > 0.4 ? '#ffffff' : '#1c1917' // white or stone-900
}

// Short indication names for column headers
const SHORT_NAMES: Record<string, string> = {
  'NSCLC': 'NSCLC',
  'Breast Cancer': 'Breast',
  'Colorectal Cancer': 'CRC',
}

export default function OpportunityMatrix({ indication, onSelectBiomarkerIndication }: Props) {
  const [data, setData] = useState<OpportunityMatrixData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hoveredCell, setHoveredCell] = useState<{ biomarker: string; indication: string } | null>(null)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getOpportunityMatrix()
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load matrix')
        setLoading(false)
      })
  }, [])

  // Find max trials for color scaling
  const maxTrials = useMemo(() => {
    if (!data) return 1
    let max = 1
    data.matrix.forEach(row => {
      row.cells.forEach(cell => {
        if (cell.totalTrials > max) max = cell.totalTrials
      })
    })
    return max
  }, [data])

  if (loading) {
    return (
      <Card className="border-stone-200">
        <CardContent className="py-16 text-center">
          <Loader2 className="w-8 h-8 text-sky-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-stone-500">Loading opportunity matrix...</p>
          <p className="text-xs text-stone-400 mt-1">Computing trial counts across all biomarker-indication pairs</p>
        </CardContent>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card className="border-stone-200">
        <CardContent className="py-12 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-red-600">{error || 'Failed to load data'}</p>
        </CardContent>
      </Card>
    )
  }

  // Cell tooltip
  const TooltipCell = ({ cell, biomarker }: { cell: OpportunityCell; biomarker: string }) => {
    if (!hoveredCell || hoveredCell.biomarker !== biomarker || hoveredCell.indication !== cell.indication) return null
    return (
      <div className="absolute z-50 bg-white border border-stone-200 rounded-lg shadow-lg p-3 min-w-[220px] -translate-x-1/2 left-1/2 bottom-full mb-2 pointer-events-none">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-stone-900">{biomarker}</span>
          <span className="text-xs text-stone-500">{cell.indication}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <span className="text-stone-400">Total Trials</span>
          <span className="text-stone-900 font-semibold tabular-nums text-right">{cell.totalTrials}</span>
          <span className="text-stone-400">Recruiting</span>
          <span className="text-emerald-700 font-medium tabular-nums text-right">{cell.recruitingTrials}</span>
          <span className="text-stone-400">Phase 3</span>
          <span className="text-stone-700 tabular-nums text-right">{cell.phase3Trials}</span>
          <span className="text-stone-400">OT Score</span>
          <span className="text-stone-700 tabular-nums text-right">{(cell.otScore * 100).toFixed(0)}%</span>
          <span className="text-stone-400">Drug Count</span>
          <span className="text-stone-700 tabular-nums text-right">{cell.drugCount}</span>
        </div>
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-stone-100">
          {cell.hasApprovedDrug && (
            <Badge className="bg-emerald-100 text-emerald-700 text-[9px] border-emerald-200">Approved Drug</Badge>
          )}
          {cell.hasFdaCdx && (
            <Badge className="bg-sky-100 text-sky-700 text-[9px] border-sky-200">FDA CDx</Badge>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Matrix header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
            <Grid3X3 className="w-5 h-5 text-sky-600" />
            Opportunity Matrix
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            {data.biomarkers.length} biomarkers × {data.indications.length} indications · Empty/light cells = white-space opportunities
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Legend */}
          <div className="flex items-center gap-2 text-[10px] text-stone-500">
            <span>Trial density:</span>
            <div className="flex items-center gap-0.5">
              <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: '#fafaf9', border: '1px solid #e7e5e4' }} />
              <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: '#e0f2fe' }} />
              <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: '#7dd3fc' }} />
              <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: '#0ea5e9' }} />
              <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: '#0284c7' }} />
            </div>
            <span>0</span>
            <span>→</span>
            <span>{maxTrials}+</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-stone-500">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span>Approved Drug</span>
            </div>
            <div className="flex items-center gap-1">
              <TestTube2 className="w-3 h-3 text-sky-500" />
              <span>FDA CDx</span>
            </div>
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <Card className="border-stone-200 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-xs font-semibold text-stone-600 px-3 py-2.5 bg-stone-50 border-b border-stone-200 sticky left-0 z-10 w-28">
                    Biomarker
                  </th>
                  {data.indications.map(ind => (
                    <th key={ind} className="text-center text-xs font-semibold text-stone-600 px-3 py-2.5 bg-stone-50 border-b border-stone-200 min-w-[140px]">
                      {SHORT_NAMES[ind] || ind}
                    </th>
                  ))}
                  <th className="text-center text-xs font-semibold text-stone-400 px-3 py-2.5 bg-stone-50 border-b border-stone-200 w-16">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.matrix.map((row) => (
                  <tr
                    key={row.biomarker}
                    className={`transition-colors ${hoveredRow === row.biomarker ? 'bg-sky-50/50' : ''}`}
                    onMouseEnter={() => setHoveredRow(row.biomarker)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <td className={`text-xs font-semibold px-3 py-1 border-b border-stone-100 sticky left-0 z-10 ${hoveredRow === row.biomarker ? 'bg-sky-50' : 'bg-white'}`}>
                      {row.biomarker}
                    </td>
                    {row.cells.map((cell) => (
                      <td
                        key={`${row.biomarker}-${cell.indication}`}
                        className="px-1 py-1 border-b border-stone-100 text-center relative"
                        onMouseEnter={() => setHoveredCell({ biomarker: row.biomarker, indication: cell.indication })}
                        onMouseLeave={() => setHoveredCell(null)}
                        onClick={() => onSelectBiomarkerIndication?.(row.biomarker, cell.indication)}
                        style={{ cursor: onSelectBiomarkerIndication ? 'pointer' : 'default' }}
                      >
                        <div
                          className="rounded-md px-2 py-2 mx-auto transition-all hover:ring-2 hover:ring-sky-400 hover:ring-offset-1 relative"
                          style={{
                            backgroundColor: getHeatmapColor(cell.totalTrials, maxTrials),
                            color: getTextColor(cell.totalTrials, maxTrials),
                          }}
                        >
                          <div className="text-sm font-bold tabular-nums">
                            {cell.totalTrials}
                          </div>
                          <div className="flex items-center justify-center gap-1 mt-0.5">
                            {cell.hasApprovedDrug && (
                              <Pill className="w-2.5 h-2.5" style={{ opacity: 0.7 }} />
                            )}
                            {cell.hasFdaCdx && (
                              <TestTube2 className="w-2.5 h-2.5" style={{ opacity: 0.7 }} />
                            )}
                            {cell.recruitingTrials > 0 && (
                              <span className="text-[8px] font-medium" style={{ opacity: 0.8 }}>
                                {cell.recruitingTrials}r
                              </span>
                            )}
                          </div>
                        </div>
                        <TooltipCell cell={cell} biomarker={row.biomarker} />
                      </td>
                    ))}
                    <td className="text-xs text-stone-500 font-semibold tabular-nums text-center px-3 py-1 border-b border-stone-100 bg-stone-50/50">
                      {row.totalAcrossIndications}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Emerging Opportunities */}
      {data.opportunities.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5 text-amber-800">
              <Zap className="w-4 h-4 text-amber-600" />
              Emerging Opportunities
            </CardTitle>
            <CardDescription className="text-xs text-amber-600">
              Biomarker-indication pairs with biological rationale (OT score &gt; 30%) but limited clinical investigation (&lt; 15 trials).
              These represent potential white-space opportunities.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {data.opportunities.map((opp, i) => (
                <div
                  key={i}
                  className="p-3 bg-white rounded-lg border border-amber-200 hover:border-amber-300 hover:shadow-sm transition-all cursor-pointer"
                  onClick={() => onSelectBiomarkerIndication?.(opp.biomarker, opp.indication)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-stone-900">{opp.biomarker}</span>
                      <ChevronRight className="w-3 h-3 text-stone-400" />
                      <span className="text-sm text-stone-600">{SHORT_NAMES[opp.indication] || opp.indication}</span>
                    </div>
                    {opp.hasApprovedDrug && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs mb-2">
                    <div>
                      <span className="text-stone-400">Trials: </span>
                      <span className="font-semibold text-stone-700 tabular-nums">{opp.totalTrials}</span>
                    </div>
                    <div>
                      <span className="text-stone-400">OT Score: </span>
                      <span className="font-semibold text-amber-700 tabular-nums">{(opp.otScore * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-stone-500 leading-relaxed">{opp.rationale}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-stone-200">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-bold tabular-nums">{data.biomarkers.length}</p>
                <p className="text-[10px] text-stone-400">Biomarkers Tracked</p>
              </div>
              <TrendingUp className="w-5 h-5 text-sky-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-bold tabular-nums">{data.indications.length}</p>
                <p className="text-[10px] text-stone-400">Indications</p>
              </div>
              <Grid3X3 className="w-5 h-5 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-bold tabular-nums">{data.opportunities.length}</p>
                <p className="text-[10px] text-stone-400">White-Space Opportunities</p>
              </div>
              <Zap className="w-5 h-5 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-bold tabular-nums">{data.matrix.reduce((s, r) => s + r.totalAcrossIndications, 0).toLocaleString()}</p>
                <p className="text-[10px] text-stone-400">Total Trial Observations</p>
              </div>
              <Pill className="w-5 h-5 text-emerald-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-[10px] text-stone-400 text-center">
        Generated {new Date(data.generatedAt).toLocaleDateString()} · Data: ClinicalTrials.gov + Open Targets Platform
        {onSelectBiomarkerIndication && ' · Click any cell to view Strategy Brief'}
      </p>
    </div>
  )
}
