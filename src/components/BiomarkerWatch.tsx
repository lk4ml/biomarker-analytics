import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Loader2, Newspaper, FlaskConical, TrendingUp, Pill,
  ArrowUpRight, ArrowDownRight, AlertCircle, Sparkles,
  ExternalLink, Calendar, Building2, Target, Lightbulb, Zap
} from 'lucide-react'
import {
  getWatchFeed, getBiomarkerWatch,
  type WatchFeed, type BiomarkerWatchDetail,
  type WatchFeedPublication, type WatchFeedTrialActivity,
  type WatchFeedCutoffAlert, type WatchFeedApproval
} from '../services/api-client'

interface Props {
  indication: string
  onOpenTrial?: (nctId: string) => void
}

// Unified timeline item for the Activity Feed
interface TimelineItem {
  id: string
  type: 'publication' | 'trial' | 'cutoff' | 'approval'
  date: string | null
  sortKey: string
  data: WatchFeedPublication | WatchFeedTrialActivity | WatchFeedCutoffAlert | WatchFeedApproval
}

const TYPE_CONFIG = {
  publication: { icon: Newspaper, label: 'Publication', color: 'bg-blue-100 text-blue-700 border-blue-200', accent: 'border-l-blue-400' },
  trial: { icon: FlaskConical, label: 'Trial Activity', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', accent: 'border-l-emerald-400' },
  cutoff: { icon: TrendingUp, label: 'Cutoff Alert', color: 'bg-amber-100 text-amber-700 border-amber-200', accent: 'border-l-amber-400' },
  approval: { icon: Pill, label: 'Drug Approval', color: 'bg-purple-100 text-purple-700 border-purple-200', accent: 'border-l-purple-400' },
}

export default function BiomarkerWatch({ indication, onOpenTrial }: Props) {
  const [feed, setFeed] = useState<WatchFeed | null>(null)
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedError, setFeedError] = useState<string | null>(null)

  const [selectedBiomarker, setSelectedBiomarker] = useState<string | null>(null)
  const [bmDetail, setBmDetail] = useState<BiomarkerWatchDetail | null>(null)
  const [bmLoading, setBmLoading] = useState(false)

  const [subTab, setSubTab] = useState('feed')
  const [feedFilter, setFeedFilter] = useState<string>('all')

  // Load activity feed
  useEffect(() => {
    setFeedLoading(true)
    setFeedError(null)
    getWatchFeed(indication)
      .then(d => { setFeed(d); setFeedLoading(false) })
      .catch(err => { setFeedError(err instanceof Error ? err.message : 'Failed to load'); setFeedLoading(false) })
  }, [indication])

  // Load biomarker detail when selected
  useEffect(() => {
    if (!selectedBiomarker) { setBmDetail(null); return }
    setBmLoading(true)
    getBiomarkerWatch(selectedBiomarker, indication)
      .then(d => { setBmDetail(d); setBmLoading(false) })
      .catch(() => setBmLoading(false))
  }, [selectedBiomarker, indication])

  // Build unified timeline
  const timeline = useMemo(() => {
    if (!feed) return []
    const items: TimelineItem[] = []

    feed.publications.forEach((p, i) => items.push({
      id: `pub-${i}`, type: 'publication', date: p.pubDate, sortKey: p.pubDate || '0000',
      data: p
    }))

    feed.trialActivity.forEach((t, i) => items.push({
      id: `trial-${i}`, type: 'trial', date: t.startDate, sortKey: t.startDate || '0000',
      data: t
    }))

    feed.cutoffAlerts.forEach((c, i) => items.push({
      id: `cutoff-${i}`, type: 'cutoff', date: null, sortKey: String(c.currentYear),
      data: c
    }))

    feed.recentApprovals.forEach((a, i) => items.push({
      id: `approval-${i}`, type: 'approval', date: null, sortKey: String(a.yearApproved || 0),
      data: a
    }))

    items.sort((a, b) => b.sortKey.localeCompare(a.sortKey))
    return items
  }, [feed])

  const filteredTimeline = useMemo(() => {
    if (feedFilter === 'all') return timeline
    return timeline.filter(t => t.type === feedFilter)
  }, [timeline, feedFilter])

  // Collect biomarkers from feed for the deep dive selector
  const availableBiomarkers = useMemo(() => {
    if (!feed) return []
    const set = new Set<string>()
    feed.publications.forEach(p => p.biomarkerMentions?.forEach(b => set.add(b)))
    feed.trialActivity.forEach(t => t.biomarkers?.forEach(b => set.add(b)))
    feed.cutoffAlerts.forEach(c => set.add(c.biomarkerName))
    feed.recentApprovals.forEach(a => set.add(a.biomarkerSymbol))
    return Array.from(set).sort()
  }, [feed])

  // White-space signals from biomarker detail
  const signals = bmDetail?.whiteSpaceSignals || []

  // ── Publication card ──
  const PubCard = ({ pub }: { pub: WatchFeedPublication }) => (
    <div className="flex-1 min-w-0">
      <a href={`https://pubmed.ncbi.nlm.nih.gov/${pub.pmid}`}
        target="_blank" rel="noopener noreferrer"
        className="text-xs font-medium text-stone-800 hover:text-sky-700 leading-snug line-clamp-2">
        {pub.title}
      </a>
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        {pub.journal && <span className="text-[10px] text-stone-400">{pub.journal}</span>}
        {pub.pubDate && <span className="text-[10px] text-stone-400">· {pub.pubDate}</span>}
        {pub.biomarkerMentions?.slice(0, 3).map(b => (
          <Badge key={b} variant="outline" className="text-[8px] py-0">{b}</Badge>
        ))}
      </div>
    </div>
  )

  // ── Trial card ──
  const TrialCard = ({ trial }: { trial: WatchFeedTrialActivity }) => (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-0.5">
        <button
          onClick={() => onOpenTrial?.(trial.nctId)}
          className="text-xs font-mono text-sky-700 hover:text-sky-800 hover:underline"
        >
          {trial.nctId}
        </button>
        <Badge variant={trial.status === 'Recruiting' ? 'default' : 'outline'} className="text-[8px] py-0">
          {trial.status}
        </Badge>
        {trial.phase && <Badge variant="secondary" className="text-[8px] py-0">{trial.phase}</Badge>}
      </div>
      <p className="text-[11px] text-stone-700 leading-snug line-clamp-1">{trial.briefTitle}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[10px] text-stone-400">{trial.sponsor}</span>
        {trial.startDate && <span className="text-[10px] text-stone-400">· {trial.startDate}</span>}
        {trial.biomarkers?.slice(0, 3).map(b => (
          <Badge key={b} variant="outline" className="text-[8px] py-0">{b}</Badge>
        ))}
      </div>
    </div>
  )

  // ── Cutoff card ──
  const CutoffCard = ({ alert }: { alert: WatchFeedCutoffAlert }) => {
    const direction = alert.currentCutoff > alert.previousCutoff ? 'up' : 'down'
    return (
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-stone-800">{alert.biomarkerName}</span>
          <span className="text-[10px] text-stone-400">in {alert.tumorType}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-stone-500">
            {alert.previousCutoff}{alert.cutoffUnit} ({alert.previousYear})
          </span>
          {direction === 'up' ? (
            <ArrowUpRight className="w-3 h-3 text-red-500" />
          ) : (
            <ArrowDownRight className="w-3 h-3 text-emerald-500" />
          )}
          <span className="text-[11px] font-semibold text-stone-800">
            {alert.currentCutoff}{alert.cutoffUnit} ({alert.currentYear})
          </span>
        </div>
      </div>
    )
  }

  // ── Approval card ──
  const ApprovalCard = ({ approval }: { approval: WatchFeedApproval }) => (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-stone-800">{approval.drugName}</span>
        <Badge variant="outline" className="text-[8px] py-0">{approval.drugType}</Badge>
        {approval.yearApproved && (
          <Badge className="bg-emerald-100 text-emerald-700 text-[8px] py-0">{approval.yearApproved}</Badge>
        )}
      </div>
      <p className="text-[11px] text-stone-600 mt-0.5">
        {approval.biomarkerSymbol} · {approval.indicationName}
      </p>
      {approval.moa && (
        <p className="text-[10px] text-stone-400 mt-0.5 truncate">{approval.moa}</p>
      )}
    </div>
  )

  // Loading state
  if (feedLoading && !feed) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-sky-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-stone-500">Loading biomarker intelligence feed...</p>
          <p className="text-xs text-stone-400 mt-1">Aggregating publications, trials, cutoffs, and approvals</p>
        </div>
      </div>
    )
  }

  if (feedError) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-red-600">{feedError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            Biomarker Watch
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Real-time intelligence feed for {indication === 'all' ? 'all indications' : indication}
          </p>
        </div>
        {feed && (
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-[10px]">
              <Newspaper className="w-3 h-3 mr-1" />
              {feed.publications.length} publications
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              <FlaskConical className="w-3 h-3 mr-1" />
              {feed.trialActivity.length} trials
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              <TrendingUp className="w-3 h-3 mr-1" />
              {feed.cutoffAlerts.length} cutoff alerts
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              <Pill className="w-3 h-3 mr-1" />
              {feed.recentApprovals.length} approvals
            </Badge>
          </div>
        )}
      </div>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="bg-white border border-stone-200 h-auto gap-0.5 p-1">
          <TabsTrigger value="feed" className="gap-1.5 text-xs">
            <Newspaper className="w-3.5 h-3.5" /> Activity Feed
          </TabsTrigger>
          <TabsTrigger value="deep-dive" className="gap-1.5 text-xs">
            <Target className="w-3.5 h-3.5" /> Biomarker Deep Dive
          </TabsTrigger>
          <TabsTrigger value="signals" className="gap-1.5 text-xs">
            <Sparkles className="w-3.5 h-3.5" /> Signal Detection
          </TabsTrigger>
        </TabsList>

        {/* ════════ ACTIVITY FEED ════════ */}
        <TabsContent value="feed">
          {/* Filter bar */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-stone-400">Show:</span>
            {(['all', 'publication', 'trial', 'cutoff', 'approval'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFeedFilter(f)}
                className={`px-2.5 py-1 text-[10px] rounded-full border transition-colors ${
                  feedFilter === f
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
                }`}
              >
                {f === 'all' ? 'All' : TYPE_CONFIG[f].label}
                {f !== 'all' && feed && (
                  <span className="ml-1 opacity-70">
                    ({f === 'publication' ? feed.publications.length :
                      f === 'trial' ? feed.trialActivity.length :
                      f === 'cutoff' ? feed.cutoffAlerts.length :
                      feed.recentApprovals.length})
                  </span>
                )}
              </button>
            ))}
          </div>

          <Card className="border-stone-200">
            <ScrollArea className="h-[600px]">
              <div className="p-4 space-y-1.5">
                {filteredTimeline.slice(0, 100).map(item => {
                  const config = TYPE_CONFIG[item.type]
                  const Icon = config.icon
                  return (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border-l-2 ${config.accent} bg-white hover:bg-stone-50 transition-colors`}
                    >
                      <div className={`shrink-0 p-1.5 rounded-md ${config.color.split(' ').slice(0, 2).join(' ')}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      {item.type === 'publication' && <PubCard pub={item.data as WatchFeedPublication} />}
                      {item.type === 'trial' && <TrialCard trial={item.data as WatchFeedTrialActivity} />}
                      {item.type === 'cutoff' && <CutoffCard alert={item.data as WatchFeedCutoffAlert} />}
                      {item.type === 'approval' && <ApprovalCard approval={item.data as WatchFeedApproval} />}
                    </div>
                  )
                })}
                {filteredTimeline.length === 0 && (
                  <p className="text-sm text-stone-400 text-center py-12">
                    No activity items found for this indication.
                  </p>
                )}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>

        {/* ════════ BIOMARKER DEEP DIVE ════════ */}
        <TabsContent value="deep-dive">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs text-stone-500 font-medium">Select biomarker:</span>
            <Select value={selectedBiomarker || ''} onValueChange={v => setSelectedBiomarker(v)}>
              <SelectTrigger className="w-48 h-8 text-xs">
                <SelectValue placeholder="Choose a biomarker..." />
              </SelectTrigger>
              <SelectContent>
                {availableBiomarkers.map(b => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {bmLoading && <Loader2 className="w-4 h-4 animate-spin text-sky-500" />}
          </div>

          {!selectedBiomarker && (
            <Card className="border-stone-200">
              <CardContent className="py-16 text-center">
                <Target className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                <p className="text-sm text-stone-500">Select a biomarker above to view its intelligence report.</p>
                <p className="text-xs text-stone-400 mt-1">
                  Publications, trials, cutoff changes, drug pipeline, and white-space signals.
                </p>
              </CardContent>
            </Card>
          )}

          {selectedBiomarker && bmDetail && !bmLoading && (
            <div className="grid grid-cols-2 gap-4">
              {/* Latest Publications */}
              <Card className="border-stone-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Newspaper className="w-4 h-4 text-blue-500" />
                    Publications ({bmDetail.publications.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[280px]">
                    <div className="space-y-2">
                      {bmDetail.publications.map((p, i) => (
                        <a key={i} href={`https://pubmed.ncbi.nlm.nih.gov/${p.pmid}`}
                          target="_blank" rel="noopener noreferrer"
                          className="block p-2 rounded hover:bg-stone-50 transition-colors">
                          <p className="text-[11px] text-stone-800 leading-snug line-clamp-2 font-medium">{p.title}</p>
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-stone-400">
                            {p.journal && <span>{p.journal}</span>}
                            {p.pubDate && <span>· {p.pubDate}</span>}
                            <ExternalLink className="w-2.5 h-2.5" />
                          </div>
                        </a>
                      ))}
                      {bmDetail.publications.length === 0 && (
                        <p className="text-xs text-stone-400 text-center py-6">No recent publications found.</p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Recent Trials */}
              <Card className="border-stone-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-emerald-500" />
                    Recent Trials ({bmDetail.recentTrials.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[280px]">
                    <div className="space-y-2">
                      {bmDetail.recentTrials.map((t, i) => (
                        <div key={i} className="p-2 rounded hover:bg-stone-50 transition-colors">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => onOpenTrial?.(t.nctId)}
                              className="text-[11px] font-mono text-sky-700 hover:underline"
                            >
                              {t.nctId}
                            </button>
                            <Badge variant={t.status === 'Recruiting' ? 'default' : 'outline'} className="text-[8px] py-0">
                              {t.status}
                            </Badge>
                            {t.phase && <Badge variant="secondary" className="text-[8px] py-0">{t.phase}</Badge>}
                          </div>
                          <p className="text-[10px] text-stone-700 line-clamp-1 mt-0.5">{t.briefTitle}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-stone-400">
                            <span>{t.sponsor}</span>
                            {t.cutoffValue && (
                              <span className="font-mono">Cutoff: {t.cutoffValue} {t.cutoffUnit}</span>
                            )}
                          </div>
                        </div>
                      ))}
                      {bmDetail.recentTrials.length === 0 && (
                        <p className="text-xs text-stone-400 text-center py-6">No recent trials found.</p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Cutoff Changes */}
              <Card className="border-stone-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-amber-500" />
                    Cutoff Changes ({bmDetail.cutoffChanges.length})
                  </CardTitle>
                  <CardDescription className="text-xs">Last 3 years across tumor types</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[240px]">
                    <div className="space-y-1.5">
                      {bmDetail.cutoffChanges.map((c, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-stone-50 rounded text-[11px]">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[8px] py-0">{c.year}</Badge>
                            <span className="text-stone-600">{c.tumorType}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold">{c.cutoffValue}{c.cutoffUnit}</span>
                            <span className="text-stone-400">{c.trialCount} trials</span>
                            {c.dominantAssay && (
                              <Badge variant="outline" className="text-[8px] py-0">{c.dominantAssay}</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                      {bmDetail.cutoffChanges.length === 0 && (
                        <p className="text-xs text-stone-400 text-center py-6">No cutoff data found.</p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Drug Pipeline */}
              <Card className="border-stone-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Pill className="w-4 h-4 text-purple-500" />
                    Drug Pipeline ({bmDetail.drugPipeline.length})
                  </CardTitle>
                  <CardDescription className="text-xs">Phase 2+ drugs targeting this biomarker</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[240px]">
                    <div className="space-y-1.5">
                      {bmDetail.drugPipeline.map((d, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-stone-50 rounded text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-stone-800">{d.drugName}</span>
                            <Badge variant="outline" className="text-[8px] py-0">{d.drugType}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            {d.isApproved ? (
                              <Badge className="bg-emerald-100 text-emerald-700 text-[8px] py-0">
                                Approved {d.yearApproved || ''}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[8px] py-0">Phase {d.maxPhase}</Badge>
                            )}
                            <span className="text-[10px] text-stone-400 truncate max-w-[100px]">{d.indicationName}</span>
                          </div>
                        </div>
                      ))}
                      {bmDetail.drugPipeline.length === 0 && (
                        <p className="text-xs text-stone-400 text-center py-6">No pipeline drugs found.</p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* White-Space Signals */}
              {signals.length > 0 && (
                <Card className="col-span-2 border-amber-200 bg-amber-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      White-Space Signals
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Indications with high Open Targets evidence but low trial activity — potential opportunities
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2">
                      {signals.map((s, i) => (
                        <div key={i} className="p-3 bg-white rounded-lg border border-amber-200">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-stone-800">{s.indicationName}</span>
                            <Badge className="bg-amber-100 text-amber-700 text-[8px] py-0">
                              OT {(s.overallScore * 100).toFixed(0)}%
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-stone-500">
                            <span>{s.trialCount} trials</span>
                            <span>{s.uniqueDrugs} drugs</span>
                          </div>
                          <div className="mt-1.5 h-1 bg-stone-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-400 rounded-full"
                              style={{ width: `${s.overallScore * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* ════════ SIGNAL DETECTION ════════ */}
        <TabsContent value="signals">
          <div className="space-y-4">
            {/* Cutoff Shift Alerts */}
            {feed && feed.cutoffAlerts.length > 0 && (
              <Card className="border-stone-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-amber-500" />
                    Cutoff Evolution Alerts
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Year-over-year shifts in biomarker testing thresholds
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {feed.cutoffAlerts.map((c, i) => {
                      const shifted = c.currentCutoff - c.previousCutoff
                      const pct = c.previousCutoff !== 0 ? ((shifted / c.previousCutoff) * 100) : 0
                      return (
                        <div key={i} className="p-3 border border-stone-200 rounded-lg hover:border-amber-300 transition-colors">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-stone-800">{c.biomarkerName}</span>
                            <span className="text-[10px] text-stone-400">{c.tumorType}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-stone-500 line-through">
                              {c.previousCutoff}{c.cutoffUnit}
                            </span>
                            {shifted > 0 ? (
                              <ArrowUpRight className="w-3.5 h-3.5 text-red-500" />
                            ) : (
                              <ArrowDownRight className="w-3.5 h-3.5 text-emerald-500" />
                            )}
                            <span className="text-sm font-bold text-stone-900">
                              {c.currentCutoff}{c.cutoffUnit}
                            </span>
                            <Badge className={`text-[8px] py-0 ${shifted > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {pct > 0 ? '+' : ''}{pct.toFixed(0)}%
                            </Badge>
                          </div>
                          <p className="text-[10px] text-stone-400 mt-1">
                            {c.previousYear} → {c.currentYear}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Approvals */}
            {feed && feed.recentApprovals.length > 0 && (
              <Card className="border-stone-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Pill className="w-4 h-4 text-purple-500" />
                    Drug Approvals
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Approved drugs targeting tracked biomarkers
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2">
                    {feed.recentApprovals.slice(0, 12).map((a, i) => (
                      <div key={i} className="p-3 border border-stone-200 rounded-lg hover:border-purple-300 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-stone-800">{a.drugName}</span>
                          {a.yearApproved && (
                            <Badge className="bg-emerald-100 text-emerald-700 text-[8px] py-0">{a.yearApproved}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mb-1">
                          <Badge variant="outline" className="text-[8px] py-0">{a.biomarkerSymbol}</Badge>
                          <Badge variant="secondary" className="text-[8px] py-0">{a.drugType}</Badge>
                        </div>
                        <p className="text-[10px] text-stone-500">{a.indicationName}</p>
                        {a.moa && <p className="text-[9px] text-stone-400 truncate mt-0.5">{a.moa}</p>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Signal prompt — select a biomarker for white-space */}
            <Card className="border-amber-200 bg-amber-50/30">
              <CardContent className="py-6 text-center">
                <Sparkles className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-stone-700">White-Space Opportunity Detection</p>
                <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
                  Select a biomarker in the &quot;Deep Dive&quot; tab to identify indications with strong biological evidence
                  (high Open Targets score) but limited clinical trial activity — potential first-mover opportunities.
                </p>
                <button
                  onClick={() => setSubTab('deep-dive')}
                  className="mt-3 px-4 py-1.5 text-xs font-medium bg-amber-100 text-amber-800 rounded-full hover:bg-amber-200 transition-colors"
                >
                  Open Biomarker Deep Dive
                </button>
              </CardContent>
            </Card>

            {feed && feed.cutoffAlerts.length === 0 && feed.recentApprovals.length === 0 && (
              <Card className="border-stone-200">
                <CardContent className="py-12 text-center">
                  <AlertCircle className="w-8 h-8 text-stone-300 mx-auto mb-3" />
                  <p className="text-sm text-stone-500">No signal alerts found for {indication}.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
