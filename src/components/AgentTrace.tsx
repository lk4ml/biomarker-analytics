import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  FlaskConical, TrendingUp, Pill, Shield, TestTube2,
  Dna, Newspaper, Sparkles, Loader2, CheckCircle2,
  AlertCircle, Clock, Timer
} from 'lucide-react'
import type { AgentStep } from '../services/api-client'

// Map step IDs to icons and colors
const STEP_META: Record<string, { icon: typeof FlaskConical; color: string; bg: string }> = {
  trial_summary: { icon: FlaskConical, color: 'text-sky-600', bg: 'bg-sky-50 border-sky-200' },
  cutoff_landscape: { icon: TrendingUp, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
  druggability: { icon: Pill, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
  evidence: { icon: Shield, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  assay_landscape: { icon: TestTube2, color: 'text-teal-600', bg: 'bg-teal-50 border-teal-200' },
  genetic_context: { icon: Dna, color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' },
  publications: { icon: Newspaper, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  llm_synthesis: { icon: Sparkles, color: 'text-violet-600', bg: 'bg-violet-50 border-violet-200' },
}

const DEFAULT_META = { icon: FlaskConical, color: 'text-stone-600', bg: 'bg-stone-50 border-stone-200' }

interface Props {
  steps: AgentStep[]
  status: 'idle' | 'gathering' | 'generating' | 'complete' | 'error'
  totalDuration: number | null
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  // Simple static display — React re-renders from parent state updates keep this updated enough
  const elapsed = Date.now() - startedAt
  return (
    <span className="text-[10px] text-stone-400 tabular-nums">
      {formatDuration(elapsed)}
    </span>
  )
}

export default function AgentTrace({ steps, status, totalDuration }: Props) {
  const completedCount = useMemo(() => steps.filter(s => s.status === 'complete').length, [steps])
  const totalSteps = steps.length

  return (
    <div className="h-full flex flex-col bg-stone-50/50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-stone-200 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-violet-100 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-violet-600" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-stone-900">Agent Trace</h3>
              <p className="text-[10px] text-stone-400">
                {status === 'idle' && 'Waiting to start'}
                {status === 'gathering' && 'Gathering data...'}
                {status === 'generating' && 'Writing report...'}
                {status === 'complete' && 'Report complete'}
                {status === 'error' && 'Error occurred'}
              </p>
            </div>
          </div>
          {totalSteps > 0 && (
            <Badge variant="secondary" className="text-[10px] tabular-nums">
              {completedCount}/{totalSteps}
            </Badge>
          )}
        </div>

        {/* Progress bar */}
        {totalSteps > 0 && status !== 'idle' && (
          <div className="mt-2 h-1.5 bg-stone-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                status === 'error' ? 'bg-red-500' :
                status === 'complete' ? 'bg-emerald-500' :
                'bg-violet-500'
              }`}
              style={{ width: `${totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0}%` }}
            />
          </div>
        )}
      </div>

      {/* Steps timeline */}
      <ScrollArea className="flex-1">
        <div className="px-4 py-3">
          {steps.length === 0 && status === 'idle' && (
            <div className="text-center py-8">
              <Clock className="w-8 h-8 text-stone-300 mx-auto mb-2" />
              <p className="text-xs text-stone-400">Agent steps will appear here</p>
            </div>
          )}

          <div className="space-y-1">
            {steps.map((step, i) => {
              const meta = STEP_META[step.id] || DEFAULT_META
              const Icon = meta.icon
              const isLast = i === steps.length - 1
              const isRunning = step.status === 'running'
              const isComplete = step.status === 'complete'
              const isError = step.status === 'error'

              return (
                <div key={step.id} className="relative">
                  {/* Vertical connector line */}
                  {!isLast && (
                    <div className="absolute left-[15px] top-[32px] bottom-0 w-px bg-stone-200" />
                  )}

                  <div className={`flex items-start gap-3 p-2 rounded-lg transition-colors ${
                    isRunning ? 'bg-white border border-stone-200 shadow-sm' : ''
                  }`}>
                    {/* Icon */}
                    <div className={`w-[30px] h-[30px] rounded-lg border flex items-center justify-center shrink-0 ${
                      isRunning ? meta.bg :
                      isComplete ? 'bg-emerald-50 border-emerald-200' :
                      isError ? 'bg-red-50 border-red-200' :
                      'bg-stone-50 border-stone-200'
                    }`}>
                      {isRunning ? (
                        <Loader2 className={`w-3.5 h-3.5 ${meta.color} animate-spin`} />
                      ) : isComplete ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : isError ? (
                        <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                      ) : (
                        <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs font-medium truncate ${
                          isRunning ? 'text-stone-900' :
                          isComplete ? 'text-stone-700' :
                          isError ? 'text-red-700' :
                          'text-stone-500'
                        }`}>
                          {step.label}
                        </p>
                        {isComplete && step.duration_ms != null && (
                          <Badge variant="outline" className="text-[9px] shrink-0 py-0 tabular-nums text-stone-400 border-stone-200">
                            <Timer className="w-2.5 h-2.5 mr-0.5" />
                            {formatDuration(step.duration_ms)}
                          </Badge>
                        )}
                        {isRunning && (
                          <ElapsedTimer startedAt={step.startedAt} />
                        )}
                      </div>

                      {/* Summary text */}
                      {step.summary && (
                        <p className="text-[11px] text-stone-500 mt-0.5 leading-relaxed">
                          {step.summary}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </ScrollArea>

      {/* Footer with total duration */}
      {status === 'complete' && totalDuration != null && (
        <div className="px-4 py-2.5 border-t border-stone-200 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[11px] font-medium text-stone-700">Report generated</span>
            </div>
            <span className="text-[11px] text-stone-500 tabular-nums">
              Total: {formatDuration(totalDuration)}
            </span>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="px-4 py-2.5 border-t border-red-200 bg-red-50">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-red-600" />
            <span className="text-[11px] font-medium text-red-700">Generation failed</span>
          </div>
        </div>
      )}
    </div>
  )
}
