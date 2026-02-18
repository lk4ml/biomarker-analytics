import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import {
  Sparkles, Loader2, XCircle, RotateCcw,
  FlaskConical, Database, FileText, Zap
} from 'lucide-react'
import { getBiomarkers } from '../services/api-client'
import { useResearchReport } from '../hooks/use-research-report'
import AgentTrace from './AgentTrace'
import ReportContent from './ReportContent'

interface Props {
  indication: string
  onOpenTrial?: (nctId: string) => void
}

export default function ResearchReport({ indication, onOpenTrial }: Props) {
  const [selectedBiomarker, setSelectedBiomarker] = useState<string>('')
  const [biomarkers, setBiomarkers] = useState<string[]>([])
  const [biomarkersLoading, setBiomarkersLoading] = useState(true)

  const report = useResearchReport()

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

  // Reset when indication changes
  useEffect(() => {
    report.resetReport()
    setSelectedBiomarker('')
  }, [indication])

  const isActive = report.status !== 'idle'
  const canGenerate = selectedBiomarker && report.status === 'idle'
  const isRunning = report.status === 'gathering' || report.status === 'generating'

  const handleGenerate = () => {
    if (!selectedBiomarker) return
    report.generateReport(indication, selectedBiomarker)
  }

  // Pre-generation state — shown when idle
  if (!isActive) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <Card className="border-stone-200 overflow-hidden">
          {/* Decorative gradient header */}
          <div className="h-1.5 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500" />

          <CardContent className="pt-8 pb-8 px-8">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-7 h-7 text-violet-600" />
              </div>
              <h2 className="text-lg font-bold text-stone-900 mb-1.5">AI Research Report</h2>
              <p className="text-sm text-stone-500 max-w-md mx-auto">
                Generate a deep research report for any biomarker in {indication}.
                The AI agent queries 7 databases in real-time, then synthesizes findings into a structured narrative.
              </p>
            </div>

            {/* Data sources preview */}
            <div className="grid grid-cols-4 gap-3 mb-8">
              {[
                { icon: FlaskConical, label: 'Clinical Trials', color: 'text-sky-600 bg-sky-50' },
                { icon: Database, label: 'Open Targets', color: 'text-emerald-600 bg-emerald-50' },
                { icon: FileText, label: 'PubMed', color: 'text-amber-600 bg-amber-50' },
                { icon: Zap, label: 'GWAS + Assays', color: 'text-rose-600 bg-rose-50' },
              ].map((src, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-stone-50">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${src.color.split(' ')[1]}`}>
                    <src.icon className={`w-4 h-4 ${src.color.split(' ')[0]}`} />
                  </div>
                  <span className="text-[10px] font-medium text-stone-600">{src.label}</span>
                </div>
              ))}
            </div>

            {/* Biomarker selector + generate button */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                {biomarkersLoading ? (
                  <div className="flex items-center gap-2 h-10 px-3 border border-stone-200 rounded-md text-sm text-stone-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading biomarkers...
                  </div>
                ) : (
                  <Select value={selectedBiomarker} onValueChange={setSelectedBiomarker}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="Select a biomarker..." />
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
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="h-10 px-6 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Generate Report
              </Button>
            </div>

            {/* Feature bullets */}
            <div className="mt-6 pt-5 border-t border-stone-100">
              <div className="grid grid-cols-3 gap-4 text-center">
                {[
                  { label: 'Live Agent Trace', desc: 'Watch each data source queried in real-time' },
                  { label: 'Inline Citations', desc: 'Click any trial ID or PMID to drill down' },
                  { label: 'Structured Sections', desc: '8 report sections covering every angle' },
                ].map((f, i) => (
                  <div key={i}>
                    <p className="text-xs font-semibold text-stone-700">{f.label}</p>
                    <p className="text-[10px] text-stone-400 mt-0.5">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Active state — two-panel layout with report + trace
  return (
    <div className="h-[calc(100vh-220px)] min-h-[600px]">
      {/* Top bar with context + controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs gap-1.5 py-1">
            <Sparkles className="w-3 h-3 text-violet-600" />
            {indication} / {selectedBiomarker}
          </Badge>
          {isRunning && (
            <Badge className="bg-violet-100 text-violet-700 text-[10px] animate-pulse">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              {report.status === 'gathering' ? 'Gathering data...' : 'Writing report...'}
            </Badge>
          )}
          {report.status === 'complete' && (
            <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
              Complete
            </Badge>
          )}
          {report.status === 'error' && (
            <Badge className="bg-red-100 text-red-700 text-[10px]">
              Error
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={report.cancelReport}
            >
              <XCircle className="w-3 h-3" />
              Cancel
            </Button>
          )}
          {(report.status === 'complete' || report.status === 'error') && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={report.resetReport}
            >
              <RotateCcw className="w-3 h-3" />
              New Report
            </Button>
          )}
        </div>
      </div>

      {/* Error message */}
      {report.error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-700">{report.error}</p>
        </div>
      )}

      {/* Two-panel resizable layout */}
      <div className="h-[calc(100%-40px)] rounded-lg border border-stone-200 overflow-hidden bg-white">
        <ResizablePanelGroup direction="horizontal">
          {/* Left: Report content */}
          <ResizablePanel defaultSize={70} minSize={50}>
            <ReportContent
              markdown={report.markdown}
              isStreaming={isRunning}
              currentSection={report.currentSection}
              onOpenTrial={onOpenTrial}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right: Agent trace */}
          <ResizablePanel defaultSize={30} minSize={20}>
            <AgentTrace
              steps={report.steps}
              status={report.status}
              totalDuration={report.totalDuration}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}
