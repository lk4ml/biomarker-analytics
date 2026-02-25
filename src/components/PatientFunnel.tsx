import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Users, ArrowRight } from 'lucide-react'
import CitationBadge from './CitationBadge'
import { getPatientFunnel } from '@/services/api-client'
import type { PatientFunnelData } from '@/services/api-client'

interface Props {
  gene: string
  variant: string
  indication: string
}

const STAGE_COLORS = [
  'bg-sky-500',
  'bg-sky-400',
  'bg-violet-500',
  'bg-violet-400',
  'bg-amber-500',
  'bg-emerald-500',
]

const STAGE_BG = [
  'bg-sky-50 border-sky-200',
  'bg-sky-50 border-sky-200',
  'bg-violet-50 border-violet-200',
  'bg-violet-50 border-violet-200',
  'bg-amber-50 border-amber-200',
  'bg-emerald-50 border-emerald-200',
]

export default function PatientFunnel({ gene, variant, indication }: Props) {
  const [data, setData] = useState<PatientFunnelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getPatientFunnel(gene, variant, indication)
      .then(d => setData(d))
      .catch(err => setError(err.message || 'Failed to load funnel'))
      .finally(() => setLoading(false))
  }, [gene, variant, indication])

  if (loading) {
    return (
      <Card className="border-stone-200">
        <CardContent className="py-12 flex items-center justify-center gap-2 text-stone-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading patient funnel...</span>
        </CardContent>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card className="border-stone-200">
        <CardContent className="py-12 text-center text-sm text-stone-400">
          {error || 'No funnel data available'}
        </CardContent>
      </Card>
    )
  }

  const maxCount = data.stages.length > 0 ? data.stages[0].count : 1

  return (
    <Card className="border-stone-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-600" />
              Patient Funnel — {gene} {variant} in {indication}
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Estimated patient flow from incidence to treatment
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            {data.datasetUsed && (
              <CitationBadge source="cbioportal" version={data.datasetUsed} />
            )}
            <Badge variant="outline" className="text-[10px]">
              {data.recruitingTrials} recruiting trials
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Horizontal funnel */}
        <div className="space-y-3">
          {data.stages.map((stage, i) => {
            const widthPct = Math.max(8, (stage.count / maxCount) * 100)
            const dropoff = i > 0
              ? ((data.stages[i - 1].count - stage.count) / data.stages[i - 1].count * 100).toFixed(0)
              : null

            return (
              <div key={stage.name} className="group">
                {/* Dropoff indicator */}
                {dropoff && (
                  <div className="flex items-center gap-1.5 mb-1 ml-2">
                    <ArrowRight className="w-3 h-3 text-stone-300" />
                    <span className="text-[10px] text-stone-400">
                      {dropoff}% reduction
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  {/* Stage label */}
                  <div className="w-32 shrink-0 text-right">
                    <p className="text-xs font-medium text-stone-700 leading-tight">{stage.name}</p>
                    <p className="text-[10px] text-stone-400">{stage.source}</p>
                  </div>

                  {/* Bar */}
                  <div className="flex-1 relative">
                    <div className="h-9 bg-stone-100 rounded-md overflow-hidden">
                      <div
                        className={`h-full ${STAGE_COLORS[i % STAGE_COLORS.length]} rounded-md transition-all duration-500 flex items-center justify-end pr-2`}
                        style={{ width: `${widthPct}%` }}
                      >
                        {widthPct > 15 && (
                          <span className="text-white text-xs font-bold tabular-nums">
                            {stage.count >= 1000 ? `${(stage.count / 1000).toFixed(stage.count >= 10000 ? 0 : 1)}K` : stage.count.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    {widthPct <= 15 && (
                      <span className="absolute left-[calc(8%+8px)] top-1/2 -translate-y-1/2 text-xs font-bold text-stone-600 tabular-nums">
                        {stage.count >= 1000 ? `${(stage.count / 1000).toFixed(1)}K` : stage.count.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* Percentage */}
                  <div className="w-14 shrink-0 text-right">
                    {stage.pct !== undefined && stage.pct !== null ? (
                      <span className="text-xs font-semibold text-stone-600 tabular-nums">
                        {stage.pct < 1 ? stage.pct.toFixed(1) : Math.round(stage.pct)}%
                      </span>
                    ) : (
                      <span className="text-xs text-stone-300">—</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Summary callout */}
        {data.stages.length >= 2 && (
          <div className="mt-5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800 leading-relaxed">
              <strong>Key Insight:</strong> Of{' '}
              {data.stages[0].count >= 1000
                ? `~${(data.stages[0].count / 1000).toFixed(0)}K`
                : data.stages[0].count.toLocaleString()}{' '}
              annual {indication} cases, only{' '}
              {data.stages[data.stages.length - 1].count.toLocaleString()}{' '}
              patients ({((data.stages[data.stages.length - 1].count / data.stages[0].count) * 100).toFixed(1)}%)
              reach the final stage — highlighting both the challenge and opportunity for {gene} {variant}-targeted therapies.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
