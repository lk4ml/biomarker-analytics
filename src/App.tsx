import { useState, useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  Cell, PieChart, Pie, AreaChart, Area
} from 'recharts'
import {
  FlaskConical, TrendingUp,
  Filter, ExternalLink, BarChart3,
  TestTube2, CircleDot, Beaker, ArrowUpRight,
  Database, Microscope, Zap, Search, Loader2,
  Building2, Combine, AlertTriangle, Pill,
  Grid3X3, Target, Sparkles
} from 'lucide-react'
import { TUMOR_TYPES } from './data/biomarker-data'
import { useBackendData, useIndications, useIndicationsSummary } from './hooks/use-backend-data'
import { CompetitiveLandscape, CutoffAdvisor, CdxGapAnalyzer, CombinationExplorer } from './components/features'
import Druggability from './components/Druggability'
import OpportunityMatrix from './components/OpportunityMatrix'
import TrialDrillDown from './components/TrialDrillDown'
import ResearchReport from './components/ResearchReport'
import VariantLandscape from './components/VariantLandscape'
import type { FilterState } from './types'

const COLORS = ['#0ea5e9', '#f97316', '#22c55e', '#a855f7', '#ef4444', '#eab308', '#06b6d4', '#ec4899', '#14b8a6', '#f59e0b', '#6366f1', '#84cc16']

// Abbreviations for indication chips
const INDICATION_SHORT: Record<string, string> = {
  'NSCLC': 'NSCLC',
  'Breast Cancer': 'Breast',
  'Melanoma': 'Melanoma',
  'Colorectal Cancer': 'CRC',
  'Urothelial Carcinoma': 'Urothelial',
  'Head & Neck SCC': 'HNSCC',
  'Gastric Cancer': 'Gastric',
  'Hepatocellular Carcinoma': 'HCC',
  'Renal Cell Carcinoma': 'RCC',
  'Ovarian Cancer': 'Ovarian',
  'Endometrial Cancer': 'Endometrial',
  'Prostate Cancer': 'Prostate',
  'Pancreatic Cancer': 'Pancreatic',
  'Cervical Cancer': 'Cervical',
}

// Colors for indication chips
const INDICATION_COLORS: Record<string, string> = {
  'NSCLC': 'bg-sky-100 text-sky-800 border-sky-300 hover:bg-sky-200',
  'Breast Cancer': 'bg-pink-100 text-pink-800 border-pink-300 hover:bg-pink-200',
  'Melanoma': 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200',
  'Colorectal Cancer': 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200',
  'Urothelial Carcinoma': 'bg-violet-100 text-violet-800 border-violet-300 hover:bg-violet-200',
  'Head & Neck SCC': 'bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200',
  'Gastric Cancer': 'bg-teal-100 text-teal-800 border-teal-300 hover:bg-teal-200',
  'Hepatocellular Carcinoma': 'bg-red-100 text-red-800 border-red-300 hover:bg-red-200',
  'Renal Cell Carcinoma': 'bg-cyan-100 text-cyan-800 border-cyan-300 hover:bg-cyan-200',
  'Ovarian Cancer': 'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200',
  'Endometrial Cancer': 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200',
  'Prostate Cancer': 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200',
  'Pancreatic Cancer': 'bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200',
  'Cervical Cancer': 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300 hover:bg-fuchsia-200',
}

// Active indication colors used in the indication bar styling inline

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [selectedIndication, setSelectedIndication] = useState<string>('all')
  const [filters, setFilters] = useState<FilterState>({
    biomarker: 'all',
    tumorType: 'all',
    setting: 'all',
    phase: 'all',
    assay: 'all',
    yearRange: [2013, 2026]
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTrialNctId, setSelectedTrialNctId] = useState<string | null>(null)

  // ===== Backend API data =====
  const { indications: backendIndications } = useIndications()
  const { summaries: indicationSummaries, loading: summariesLoading } = useIndicationsSummary()
  const backendData = useBackendData(selectedIndication)
  const [hoveredIndication, setHoveredIndication] = useState<string | null>(null)

  // Unpack backend data into the same variable names the UI expects
  const indicationTrials = backendData.trials
  const indicationBiomarkers = backendData.biomarkers
  const indicationAssays = backendData.assays
  const indicationCutoffTrends = backendData.cutoffTrends

  // Available indications — from backend API
  const availableIndications = useMemo(() => {
    // Use backend indications if loaded, otherwise fallback to a default list
    if (backendIndications.length > 0) {
      return backendIndications.map(i => i.name)
    }
    return ['NSCLC', 'Breast Cancer', 'Colorectal Cancer']
  }, [backendIndications])

  // Sub-filtering within indication (trial table filters - client-side on the page of data)
  const filteredTrials = indicationTrials.filter(t => {
    if (filters.biomarker !== 'all' && t.biomarkerName !== filters.biomarker) return false
    if (filters.tumorType !== 'all' && t.tumorType !== filters.tumorType) return false
    if (filters.setting !== 'all' && t.setting !== filters.setting) return false
    if (filters.phase !== 'all' && t.phase !== filters.phase) return false
    if (searchQuery && !t.trialTitle.toLowerCase().includes(searchQuery.toLowerCase()) && !t.nctId.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const uniqueBiomarkers = [...new Set(indicationTrials.map(t => t.biomarkerName))]
  const uniqueSettings = [...new Set(indicationTrials.map(t => t.setting))]
  const uniquePhases = [...new Set(indicationTrials.map(t => t.phase))]

  // Use dashboard stats from backend (server-computed) or fallback to client-side counts
  const stats = backendData.dashboardStats
  const totalTrials = stats?.totalTrials ?? new Set(indicationTrials.map(t => t.nctId)).size
  const totalBiomarkers = stats?.totalBiomarkers ?? indicationBiomarkers.length
  const totalAssays = stats?.totalAssays ?? indicationAssays.length
  const fdaApprovedAssays = stats?.fdaApprovedAssays ?? indicationAssays.filter(a => a.fdaApproved).length
  const recruitingCount = stats?.recruitingCount ?? indicationTrials.filter(t => t.status === 'Recruiting').length

  // Use server-computed distributions when available, fallback to client-side
  const biomarkerCounts = stats?.biomarkerCounts ?? uniqueBiomarkers.map(b => ({
    name: b,
    value: indicationTrials.filter(t => t.biomarkerName === b).length
  })).sort((a, b) => b.value - a.value)

  const tumorTypeCounts = TUMOR_TYPES.map(tt => ({
    name: tt.length > 12 ? tt.substring(0, 12) + '...' : tt,
    fullName: tt,
    trials: indicationTrials.filter(t => t.tumorType === tt).length
  })).filter(t => t.trials > 0).sort((a, b) => b.trials - a.trials)

  const yearDist = stats?.yearDistribution ?? Array.from({ length: 14 }, (_, i) => {
    const year = 2013 + i
    return {
      year,
      trials: indicationTrials.filter(t => t.startYear === year).length
    }
  }).filter(y => y.trials > 0)

  const settingDistFallback = useMemo(() => {
    const settings = [...new Set(indicationTrials.map(t => t.setting))]
    return settings.map(s => ({
      name: s,
      value: indicationTrials.filter(t => t.setting === s).length
    })).sort((a, b) => b.value - a.value)
  }, [indicationTrials])
  const settingDist = stats?.settingDistribution ?? settingDistFallback

  const sponsorDistFallback = useMemo(() => {
    const sponsors: Record<string, number> = {}
    indicationTrials.forEach(t => {
      sponsors[t.sponsor] = (sponsors[t.sponsor] || 0) + 1
    })
    return Object.entries(sponsors)
      .map(([name, value]) => ({ name: name.length > 18 ? name.substring(0, 18) + '...' : name, fullName: name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [indicationTrials])
  const sponsorDist = stats?.sponsorDistribution?.map(s => ({ ...s, fullName: s.name })) ?? sponsorDistFallback

  // Cutoff trend biomarkers computed in trendChartData below

  // Build dynamic cutoff trend charts per biomarker for the indication
  const trendChartData = useMemo(() => {
    const charts: { biomarker: string; tumorType: string; data: import('./types').CutoffTrend[]; insight: string }[] = []
    const seen = new Set<string>()
    indicationCutoffTrends.forEach(c => {
      const key = `${c.biomarkerName}-${c.tumorType}`
      if (!seen.has(key)) {
        seen.add(key)
        const data = indicationCutoffTrends.filter(x => x.biomarkerName === c.biomarkerName && x.tumorType === c.tumorType)
        let insight = ''
        if (c.biomarkerName === 'PD-L1' && c.tumorType === 'NSCLC') {
          insight = 'The field shifted from TPS ≥50% (KEYNOTE-024) to TPS ≥1% (KEYNOTE-189), driven by combination therapy. By 2022, assay harmonization across 22C3, SP263, and 28-8 became standard.'
        } else if (c.biomarkerName === 'PD-L1' && c.tumorType === 'Breast Cancer') {
          insight = 'CPS emerged as the preferred PD-L1 scoring. CPS ≥10 became FDA-approved for pembrolizumab in TNBC (KEYNOTE-355), while CPS ≥1 showed insufficient clinical benefit.'
        } else if (c.biomarkerName === 'TMB') {
          insight = 'TMB ≥10 mut/Mb established as FDA-approved threshold (KEYNOTE-158). Blood TMB varied (16-20 mut/Mb) but tissue TMB converged on 10 mut/Mb.'
        } else if (c.biomarkerName === 'HER2') {
          insight = 'HER2 testing shifted from binary to a spectrum. DESTINY-Breast04 established "HER2-low." By 2024, "HER2-ultralow" (IHC 0 with faint staining) emerged.'
        } else {
          insight = `${c.biomarkerName} cutoff trends in ${c.tumorType} show evolving testing standards and enrichment strategies.`
        }
        charts.push({ biomarker: c.biomarkerName, tumorType: c.tumorType, data, insight })
      }
    })
    return charts
  }, [indicationCutoffTrends])

  const trendColors = ['#0ea5e9', '#22c55e', '#a855f7', '#ec4899', '#f97316', '#06b6d4']

  // Compute totals from summaries for the landing page (filtered to our 3 core indications)
  const coreIndications = ['NSCLC', 'Breast Cancer', 'Colorectal Cancer']
  const coreSummaries = indicationSummaries.filter(i => coreIndications.includes(i.name))
  const totalTrialsAll = coreSummaries.reduce((s, i) => s + i.trialCount, 0)
  const totalPubmedAll = coreSummaries.reduce((s, i) => s + i.pubmedArticles, 0)

  // The currently hovered/selected indication in the dropdown
  const hoveredSummary = indicationSummaries.find(s => s.name === hoveredIndication)

  // Aggregate biomarker count across all core indications
  const totalBiomarkersAll = coreSummaries.length > 0
    ? Math.max(...coreSummaries.map(s => s.uniqueBiomarkers))
    : 16
  const totalRecruitingAll = coreSummaries.reduce((s, i) => s + i.recruitingTrials, 0)

  // Landing page — shown when no indication is selected
  if (selectedIndication === 'all') {
    return (
      <TooltipProvider>
        <div className="min-h-screen bg-slate-50">
          {/* Minimal top bar */}
          <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200/60 sticky top-0 z-50">
            <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0063BE 0%, #0084FF 100%)' }}>
                  <Microscope className="w-4.5 h-4.5 text-white" />
                </div>
                <span className="text-sm font-bold tracking-tight text-slate-900">BiomarkerScope</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live data
                </div>
              </div>
            </div>
          </header>

          {/* Hero — centered, blue gradient */}
          <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #001D3D 0%, #003566 30%, #0063BE 70%, #0084FF 100%)' }}>
            {/* Subtle pattern overlay */}
            <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
            <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-24 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 mb-6">
                <Database className="w-3.5 h-3.5 text-blue-200" />
                <span className="text-xs text-blue-100 font-medium">{totalTrialsAll.toLocaleString()} clinical trials indexed from ClinicalTrials.gov</span>
              </div>
              <h1 className="text-4xl font-bold text-white mb-4 leading-tight max-w-3xl mx-auto tracking-tight">
                Oncology Biomarker Intelligence Platform
              </h1>
              <p className="text-lg text-blue-100/80 mb-10 max-w-2xl mx-auto leading-relaxed">
                Unified analytics across clinical trials, druggability, competitive landscape, and companion diagnostics — powered by real-time data from ClinicalTrials.gov, Open Targets, and PubMed.
              </p>

              {/* Centered CTA — Dropdown + info card */}
              <div className="flex flex-col items-center gap-5">
                <p className="text-sm text-blue-200/70 font-medium">Select an indication to explore</p>

                {/* Dropdown */}
                <div className="w-full max-w-sm">
                  {summariesLoading ? (
                    <div className="flex items-center justify-center gap-2 h-12 px-5 bg-white/10 border border-white/20 rounded-xl text-sm text-blue-200">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading indications...
                    </div>
                  ) : (
                    <Select onValueChange={(v) => setHoveredIndication(v)} value={hoveredIndication ?? undefined}>
                      <SelectTrigger className="h-12 text-sm bg-white border-white/80 text-slate-700 rounded-xl hover:shadow-lg hover:shadow-white/20 transition-all [&>svg]:text-slate-400">
                        <SelectValue placeholder="Choose an oncology indication..." />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {indicationSummaries.filter(ind => coreIndications.includes(ind.name)).map(ind => (
                          <SelectItem key={ind.name} value={ind.name} className="py-2.5">
                            <div className="flex items-center gap-3">
                              <span className="font-medium">{ind.displayName}</span>
                              <span className="text-[11px] text-slate-400 tabular-nums">{ind.trialCount.toLocaleString()} trials</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Info card — appears when an indication is selected in dropdown */}
                {hoveredSummary && (
                  <div className="w-full max-w-md rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 p-6 text-left transition-all duration-300 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-white">{hoveredSummary.displayName}</h3>
                      <span className="flex items-center gap-1.5 text-[11px] text-emerald-300 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {hoveredSummary.recruitingTrials} recruiting
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mb-5">
                      <div>
                        <p className="text-2xl font-bold text-white tabular-nums">{hoveredSummary.trialCount.toLocaleString()}</p>
                        <p className="text-[11px] text-blue-200/60 mt-0.5">Clinical Trials</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-white tabular-nums">{hoveredSummary.uniqueBiomarkers}</p>
                        <p className="text-[11px] text-blue-200/60 mt-0.5">Biomarkers</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-white tabular-nums">{hoveredSummary.pubmedArticles}</p>
                        <p className="text-[11px] text-blue-200/60 mt-0.5">Publications</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mb-5">
                      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                          style={{ width: `${(hoveredSummary.recruitingTrials / hoveredSummary.trialCount * 100)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-blue-200/60 tabular-nums whitespace-nowrap">
                        {Math.round(hoveredSummary.recruitingTrials / hoveredSummary.trialCount * 100)}% actively recruiting
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedIndication(hoveredSummary.name)}
                      className="w-full py-3 rounded-xl bg-white text-sm font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-white/20 flex items-center justify-center gap-2"
                      style={{ color: '#0063BE' }}
                    >
                      Explore {hoveredSummary.displayName}
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Stat pills */}
              <div className={`flex items-center justify-center gap-6 ${hoveredSummary ? 'mt-8' : 'mt-12'}`}>
                {[
                  { label: 'Biomarkers', value: totalBiomarkersAll.toString(), icon: CircleDot },
                  { label: 'Recruiting', value: totalRecruitingAll.toLocaleString(), icon: Search },
                  { label: 'Assay Platforms', value: '18', icon: Beaker },
                  { label: 'Data Sources', value: '3', icon: Database },
                ].map((stat, i) => (
                  <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10">
                    <stat.icon className="w-4 h-4 text-blue-300/60" />
                    <div className="text-left">
                      <p className="text-sm font-bold text-white tabular-nums">{stat.value}</p>
                      <p className="text-[10px] text-blue-200/50">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Capabilities section */}
          <div className="max-w-6xl mx-auto px-6 py-16">
            <div className="text-center mb-10">
              <h2 className="text-xl font-bold text-slate-900 mb-2">What you can do</h2>
              <p className="text-sm text-slate-500 max-w-xl mx-auto">
                Insights that typically require weeks of manual research — delivered in seconds from live clinical databases.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-5">
              {[
                {
                  icon: TrendingUp,
                  title: 'Cutoff Evolution',
                  description: 'Track how PD-L1, TMB, and MSI thresholds shift across trials year-over-year. Design enrichment strategies based on real data.',
                },
                {
                  icon: Pill,
                  title: 'Druggability Intel',
                  description: 'See approved drugs, tractability scores, and the full pipeline for every biomarker target from Open Targets.',
                },
                {
                  icon: Building2,
                  title: 'Competitive Landscape',
                  description: 'Identify which sponsors dominate each biomarker-indication space and where the white space opportunities exist.',
                },
                {
                  icon: Target,
                  title: 'Variant Intelligence',
                  description: 'Mutation-level analysis joining cBioPortal, OncoKB, CIViC, and trial data for actionable variant insights.',
                },
                {
                  icon: Sparkles,
                  title: 'AI Research Reports',
                  description: 'Generate deep-dive biomarker reports with Claude AI — pulling from all indexed data sources in real time.',
                },
                {
                  icon: AlertTriangle,
                  title: 'CDx Gap Analysis',
                  description: 'Find trials using biomarkers without FDA-approved companion diagnostics. Spot regulatory gaps before they become problems.',
                },
              ].map((feature, i) => (
                <div key={i} className="group p-5 rounded-xl bg-white border border-slate-200/80 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg, #EBF3FF 0%, #DBEAFE 100%)' }}>
                    <feature.icon className="w-5 h-5" style={{ color: '#0063BE' }} />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-1.5">{feature.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Data sources — minimal strip */}
          <div className="border-t border-slate-200/60 bg-white">
            <div className="max-w-6xl mx-auto px-6 py-8">
              <p className="text-xs text-slate-400 text-center mb-4 font-medium uppercase tracking-wider">Powered by real-time public data</p>
              <div className="flex items-center justify-center gap-8">
                {[
                  { name: 'ClinicalTrials.gov', url: 'https://clinicaltrials.gov', count: `${totalTrialsAll.toLocaleString()} trials` },
                  { name: 'Open Targets Platform', url: 'https://platform.opentargets.org', count: '4,410 drug records' },
                  { name: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov', count: `${totalPubmedAll} articles` },
                ].map((source, i) => (
                  <a key={i} href={source.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-slate-500 hover:text-[#0063BE] transition-colors group">
                    <span className="text-sm font-medium">{source.name}</span>
                    <span className="text-[10px] text-slate-400 group-hover:text-blue-400">({source.count})</span>
                    <ExternalLink className="w-3 h-3 opacity-40 group-hover:opacity-100 transition-opacity" />
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <footer className="border-t border-slate-100 bg-slate-50">
            <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between text-[11px] text-slate-400">
              <span>BiomarkerScope — Built for biomarker strategy, clinical development, and competitive intelligence teams.</span>
              <span>Last updated: Feb 2026</span>
            </div>
          </footer>
        </div>
      </TooltipProvider>
    )
  }

  // ===== INDICATION SELECTED — Full dashboard view =====
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-stone-50 text-stone-900">
        {/* HEADER with indication context */}
        <header className="border-b border-stone-200 bg-white sticky top-0 z-50">
          <div className="max-w-[1400px] mx-auto px-6 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-sky-600 rounded flex items-center justify-center">
                <Microscope className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight">BiomarkerScope</h1>
                <p className="text-xs text-stone-500">Oncology Biomarker Analytics Platform</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {backendData.loading && (
                <Badge className="bg-sky-600 text-white text-xs">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Loading data...
                </Badge>
              )}
              <Badge className="bg-emerald-600 text-white text-xs animate-pulse">
                <Database className="w-3 h-3 mr-1" />
                LIVE — {totalTrials} trials from CT.gov
              </Badge>
            </div>
          </div>
        </header>

        {/* SELECTED INDICATION BAR — large, unmissable */}
        <div className={`border-b-2 ${
          selectedIndication === 'NSCLC' ? 'bg-sky-600 border-sky-700 text-white' :
          selectedIndication === 'Breast Cancer' ? 'bg-pink-600 border-pink-700 text-white' :
          selectedIndication === 'Melanoma' ? 'bg-amber-600 border-amber-700 text-white' :
          selectedIndication === 'Colorectal Cancer' ? 'bg-emerald-600 border-emerald-700 text-white' :
          selectedIndication === 'Urothelial Carcinoma' ? 'bg-violet-600 border-violet-700 text-white' :
          selectedIndication === 'Head & Neck SCC' ? 'bg-orange-600 border-orange-700 text-white' :
          selectedIndication === 'Gastric Cancer' ? 'bg-teal-600 border-teal-700 text-white' :
          selectedIndication === 'Hepatocellular Carcinoma' ? 'bg-red-600 border-red-700 text-white' :
          selectedIndication === 'Ovarian Cancer' ? 'bg-purple-600 border-purple-700 text-white' :
          selectedIndication === 'Endometrial Cancer' ? 'bg-rose-600 border-rose-700 text-white' :
          selectedIndication === 'Prostate Cancer' ? 'bg-blue-600 border-blue-700 text-white' :
          'bg-stone-700 border-stone-800 text-white'
        }`}>
          <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold">{selectedIndication}</h2>
                  <span className="text-xs opacity-70">Biomarker Intelligence</span>
                </div>
                <p className="text-xs opacity-80 mt-0.5">
                  {totalTrials} trials · {uniqueBiomarkers.length} biomarkers · {totalAssays} assays · {recruitingCount} recruiting
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                {uniqueBiomarkers.slice(0, 5).map(b => (
                  <span key={b} className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 font-medium">{b}</span>
                ))}
                {uniqueBiomarkers.length > 5 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20">+{uniqueBiomarkers.length - 5}</span>
                )}
              </div>
              <button
                onClick={() => setSelectedIndication('all')}
                className="px-3 py-1.5 text-xs font-medium rounded bg-white/20 hover:bg-white/30 transition-colors border border-white/30"
              >
                Change Indication
              </button>
            </div>
          </div>
        </div>

        <main className="max-w-[1400px] mx-auto px-6 py-5">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-white border border-stone-200 mb-5 flex-wrap h-auto gap-0.5 p-1">
              <TabsTrigger value="dashboard" className="gap-1.5 text-xs">
                <BarChart3 className="w-3.5 h-3.5" /> Dashboard
              </TabsTrigger>
              <TabsTrigger value="trials" className="gap-1.5 text-xs">
                <FlaskConical className="w-3.5 h-3.5" /> Trial Biomarkers
                {backendData.loading && <Loader2 className="w-3 h-3 animate-spin" />}
              </TabsTrigger>
              <TabsTrigger value="cutoff-advisor" className="gap-1.5 text-xs">
                <Zap className="w-3.5 h-3.5" /> Cutoff Advisor
              </TabsTrigger>
              <TabsTrigger value="competitive" className="gap-1.5 text-xs">
                <Building2 className="w-3.5 h-3.5" /> Competitive Intel
              </TabsTrigger>
              <TabsTrigger value="cdx-gaps" className="gap-1.5 text-xs">
                <AlertTriangle className="w-3.5 h-3.5" /> CDx Gaps
              </TabsTrigger>
              <TabsTrigger value="combinations" className="gap-1.5 text-xs">
                <Combine className="w-3.5 h-3.5" /> Combinations
              </TabsTrigger>
              <TabsTrigger value="druggability" className="gap-1.5 text-xs">
                <Pill className="w-3.5 h-3.5" /> Druggability
              </TabsTrigger>
              <TabsTrigger value="opportunity-matrix" className="gap-1.5 text-xs">
                <Grid3X3 className="w-3.5 h-3.5" /> Opportunity Matrix
              </TabsTrigger>
              <TabsTrigger value="ai-research" className="gap-1.5 text-xs">
                <Sparkles className="w-3.5 h-3.5" /> AI Research
              </TabsTrigger>
              <TabsTrigger value="variant-intel" className="gap-1.5 text-xs">
                <Target className="w-3.5 h-3.5" /> Variant Intelligence
              </TabsTrigger>
              <TabsTrigger value="assays" className="gap-1.5 text-xs">
                <TestTube2 className="w-3.5 h-3.5" /> Assays &amp; CDx
              </TabsTrigger>
            </TabsList>

            {/* DASHBOARD TAB */}
            <TabsContent value="dashboard">
              <div className="grid grid-cols-5 gap-4 mb-5">
                {[
                  { label: 'Biomarkers', value: totalBiomarkers, icon: CircleDot, color: 'text-sky-600' },
                  { label: 'Trials', value: totalTrials, icon: FlaskConical, color: 'text-orange-600' },
                  { label: 'Recruiting Now', value: recruitingCount, icon: Search, color: 'text-green-600' },
                  { label: 'Assay Platforms', value: totalAssays, icon: Beaker, color: 'text-emerald-600' },
                  { label: 'FDA-Approved CDx', value: fdaApprovedAssays, icon: Zap, color: 'text-purple-600' },
                ].map((stat, i) => (
                  <Card key={i} className="border-stone-200">
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-2xl font-bold">{stat.value}</p>
                          <p className="text-xs text-stone-500 mt-0.5">{stat.label}</p>
                        </div>
                        <stat.icon className={`w-7 h-7 ${stat.color} opacity-60`} />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-4 mb-5">
                <Card className="border-stone-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Biomarker Usage{selectedIndication !== 'all' ? ` — ${selectedIndication}` : ''}</CardTitle>
                    <CardDescription className="text-xs">Trials per biomarker (top 10)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={biomarkerCounts.slice(0, 10)} layout="vertical" margin={{ left: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={55} />
                        <RechartsTooltip />
                        <Bar dataKey="value" name="Trials" radius={[0, 3, 3, 0]}>
                          {biomarkerCounts.slice(0, 10).map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {selectedIndication === 'all' ? (
                  <Card className="border-stone-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Trials by Tumor Type</CardTitle>
                      <CardDescription className="text-xs">Distribution across cancer types</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={tumorTypeCounts} layout="vertical" margin={{ left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                          <XAxis type="number" tick={{ fontSize: 10 }} />
                          <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={85} />
                          <RechartsTooltip content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return <div className="bg-white border border-stone-200 rounded p-2 shadow text-xs"><p className="font-medium">{payload[0].payload.fullName}</p><p>{payload[0].value} trials</p></div>
                            }
                            return null
                          }} />
                          <Bar dataKey="trials" fill="#0ea5e9" radius={[0, 3, 3, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-stone-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Therapeutic Settings — {INDICATION_SHORT[selectedIndication]}</CardTitle>
                      <CardDescription className="text-xs">Trial distribution by treatment line</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={settingDist} layout="vertical" margin={{ left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                          <XAxis type="number" tick={{ fontSize: 10 }} />
                          <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={85} />
                          <RechartsTooltip />
                          <Bar dataKey="value" name="Trials" fill="#a855f7" radius={[0, 3, 3, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                <Card className="border-stone-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Trial Start Year Distribution</CardTitle>
                    <CardDescription className="text-xs">{selectedIndication !== 'all' ? `${selectedIndication} trials` : 'All trials'} by year</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={yearDist}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                        <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <RechartsTooltip />
                        <Area type="monotone" dataKey="trials" fill="#f97316" fillOpacity={0.15} stroke="#f97316" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Top sponsors chart for specific indication */}
              {selectedIndication !== 'all' && sponsorDist.length > 0 && (
                <Card className="border-stone-200 mb-5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Top Sponsors — {selectedIndication}</CardTitle>
                    <CardDescription className="text-xs">Companies running biomarker-driven trials in {selectedIndication}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={sponsorDist}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={50} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <RechartsTooltip content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return <div className="bg-white border border-stone-200 rounded p-2 shadow text-xs"><p className="font-medium">{payload[0].payload.fullName}</p><p>{payload[0].value} trials</p></div>
                          }
                          return null
                        }} />
                        <Bar dataKey="value" name="Trials" fill="#06b6d4" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

            </TabsContent>

            {/* TRIAL BIOMARKERS TAB */}
            <TabsContent value="trials">
              <Card className="border-stone-200 mb-4">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Filter className="w-3.5 h-3.5 text-stone-400" />
                      <span className="text-xs font-medium text-stone-500">Filters</span>
                    </div>
                    <Input
                      placeholder="Search by trial name or NCT ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-64 h-8 text-xs"
                    />
                    <Select value={filters.biomarker} onValueChange={(v) => setFilters(f => ({ ...f, biomarker: v }))}>
                      <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Biomarker" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Biomarkers</SelectItem>
                        {uniqueBiomarkers.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {selectedIndication === 'all' && (
                      <Select value={filters.tumorType} onValueChange={(v) => setFilters(f => ({ ...f, tumorType: v }))}>
                        <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Tumor Type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Tumor Types</SelectItem>
                          {TUMOR_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    <Select value={filters.setting} onValueChange={(v) => setFilters(f => ({ ...f, setting: v }))}>
                      <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Setting" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Settings</SelectItem>
                        {uniqueSettings.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={filters.phase} onValueChange={(v) => setFilters(f => ({ ...f, phase: v }))}>
                      <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Phase" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Phases</SelectItem>
                        {uniquePhases.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Badge variant="secondary" className="text-xs">{filteredTrials.length} results</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-stone-200">
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead className="w-28">NCT ID</TableHead>
                        <TableHead>Trial</TableHead>
                        <TableHead className="w-20">Biomarker</TableHead>
                        <TableHead className="w-28">Tumor Type</TableHead>
                        <TableHead className="w-16">Setting</TableHead>
                        <TableHead className="w-28">Cutoff</TableHead>
                        <TableHead className="w-32">Assay</TableHead>
                        <TableHead className="w-14 text-center">CDx</TableHead>
                        <TableHead className="w-20">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTrials.map((trial, i) => (
                        <TableRow key={`${trial.nctId}-${trial.biomarkerName}-${i}`} className="text-xs">
                          <TableCell className="font-mono text-sky-700">
                            <button
                              onClick={() => setSelectedTrialNctId(trial.nctId)}
                              className="hover:underline flex items-center gap-1 text-sky-700 hover:text-sky-800"
                            >
                              {trial.nctId} <ExternalLink className="w-2.5 h-2.5" />
                            </button>
                          </TableCell>
                          <TableCell className="font-medium max-w-xs truncate">{trial.trialTitle}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{trial.biomarkerName}</Badge></TableCell>
                          <TableCell className="text-stone-600">{trial.tumorType}</TableCell>
                          <TableCell><Badge variant="secondary" className="text-[10px]">{trial.setting}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">
                            {trial.cutoffOperator === 'positive' || trial.cutoffOperator === 'negative' ? (
                              <span>{trial.cutoffValue}</span>
                            ) : (
                              <span>{trial.cutoffOperator}{trial.cutoffValue} {trial.cutoffUnit}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-stone-600 text-[11px]">{trial.assayName}</TableCell>
                          <TableCell className="text-center">
                            {trial.companionDiagnostic ? (
                              <Badge className="bg-emerald-100 text-emerald-700 text-[9px] px-1">CDx</Badge>
                            ) : (
                              <span className="text-stone-300">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Badge variant={trial.status === 'Recruiting' ? 'default' : trial.status === 'Active' ? 'outline' : 'secondary'} className="text-[10px]">{trial.status}</Badge>
                              {(trial.status === 'Recruiting' || trial.status === 'Active') && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredTrials.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-stone-400 py-8 text-xs">
                            No trials match the current filters. Try adjusting your search or selecting a different indication.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </Card>
            </TabsContent>

            {/* CUTOFF TRENDS TAB */}
            <TabsContent value="trends">
              {trendChartData.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 mb-5">
                  {trendChartData.map((chart, ci) => (
                    <Card key={`${chart.biomarker}-${chart.tumorType}`} className="border-stone-200">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{chart.biomarker} Cutoff Trend — {chart.tumorType}</CardTitle>
                        <CardDescription className="text-xs">Historical cutoff evolution and trial adoption</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={280}>
                          <LineChart data={chart.data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                            <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                            <YAxis yAxisId="left" tick={{ fontSize: 10 }} label={{ value: 'Trials', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} label={{ value: 'Cutoff Value', angle: 90, position: 'insideRight', style: { fontSize: 10 } }} />
                            <RechartsTooltip contentStyle={{ fontSize: 11 }} />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Line yAxisId="left" type="monotone" dataKey="trialCount" name="Trial Count" stroke={trendColors[ci % trendColors.length]} strokeWidth={2} dot={{ r: 3 }} />
                            <Line yAxisId="right" type="stepAfter" dataKey="cutoffValue" name="Cutoff Value" stroke="#f97316" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                        <div className="mt-3 p-3 bg-stone-50 rounded text-xs text-stone-700 leading-relaxed">
                          <strong>Key Insight:</strong> {chart.insight}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="border-stone-200">
                  <CardContent className="py-12 text-center">
                    <TrendingUp className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                    <p className="text-sm text-stone-500">No cutoff trend data available for {selectedIndication}.</p>
                    <p className="text-xs text-stone-400 mt-1">Select "All Indications" or choose NSCLC / Breast Cancer for detailed cutoff trend analysis.</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* CUTOFF ADVISOR TAB (Feature 3) */}
            <TabsContent value="cutoff-advisor">
              <CutoffAdvisor
                trials={indicationTrials}
                cutoffTrends={indicationCutoffTrends}
                indication={selectedIndication}
                biomarkers={uniqueBiomarkers}
              />
            </TabsContent>

            {/* COMPETITIVE INTELLIGENCE TAB (Feature 4) */}
            <TabsContent value="competitive">
              <CompetitiveLandscape
                trials={indicationTrials}
                indication={selectedIndication}
                loading={backendData.loading}
              />
            </TabsContent>

            {/* CDx GAP ANALYZER TAB (Feature 5) */}
            <TabsContent value="cdx-gaps">
              <CdxGapAnalyzer
                trials={indicationTrials}
                assays={indicationAssays}
                indication={selectedIndication}
                biomarkers={uniqueBiomarkers}
              />
            </TabsContent>

            {/* MULTI-BIOMARKER COMBINATIONS TAB (Feature 6) */}
            <TabsContent value="combinations">
              <CombinationExplorer
                trials={indicationTrials}
                indication={selectedIndication}
              />
            </TabsContent>


            {/* DRUGGABILITY TAB — Open Targets data */}
            <TabsContent value="druggability">
              <Druggability indication={selectedIndication} />
            </TabsContent>


            {/* OPPORTUNITY MATRIX TAB — Biomarker × Indication heatmap */}
            <TabsContent value="opportunity-matrix">
              <OpportunityMatrix
                indication={selectedIndication}
                onSelectBiomarkerIndication={(biomarker, ind) => {
                  setSelectedIndication(ind)
                  setActiveTab('dashboard')
                }}
              />
            </TabsContent>


            {/* AI RESEARCH REPORT TAB — Deep research with live agent trace */}
            <TabsContent value="ai-research">
              <ResearchReport
                indication={selectedIndication}
                onOpenTrial={(nctId) => setSelectedTrialNctId(nctId)}
              />
            </TabsContent>

            {/* VARIANT INTELLIGENCE TAB — Mutation-level cross-source data */}
            <TabsContent value="variant-intel">
              <VariantLandscape indication={selectedIndication} />
            </TabsContent>

            {/* ASSAYS TAB */}
            <TabsContent value="assays">
              <Card className="border-stone-200">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">Assay &amp; Companion Diagnostic Landscape{selectedIndication !== 'all' ? ` — ${selectedIndication}` : ''}</CardTitle>
                      <CardDescription className="text-xs">{indicationAssays.length} platforms across IHC, NGS, PCR &amp; ctDNA technologies</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-[10px]">{fdaApprovedAssays} FDA-Approved</Badge>
                      <Badge variant="secondary" className="text-[10px]">{totalAssays - fdaApprovedAssays} Research Use</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[550px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead>Assay Name</TableHead>
                          <TableHead>Manufacturer</TableHead>
                          <TableHead>Platform</TableHead>
                          <TableHead>Biomarkers</TableHead>
                          <TableHead>FDA Status</TableHead>
                          <TableHead>CDx Indications</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {indicationAssays.map((assay, i) => (
                          <TableRow key={i} className="text-xs">
                            <TableCell className="font-medium">{assay.name}</TableCell>
                            <TableCell className="text-stone-600">{assay.manufacturer}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">{assay.platform}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {assay.biomarkers.map(b => (
                                  <Badge key={b} variant="secondary" className="text-[9px] py-0">{b}</Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              {assay.fdaApproved ? (
                                <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">FDA Approved</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-stone-400">Research</Badge>
                              )}
                            </TableCell>
                            <TableCell className="max-w-xs">
                              <div className="text-[11px] text-stone-600 leading-snug">
                                {assay.companionDiagnosticFor.length > 0 ? assay.companionDiagnosticFor.join('; ') : '-'}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {indicationAssays.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-stone-400 py-8 text-xs">
                              No assays found for this indication.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>


          </Tabs>
        </main>

        <footer className="border-t border-stone-200 bg-white mt-8">
          <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
            <p className="text-[10px] text-stone-400">BiomarkerScope — Oncology Biomarker Analytics. Data from ClinicalTrials.gov, PubMed &amp; Open Targets.</p>
            <div className="flex items-center gap-3 text-[10px] text-stone-400">
              <span>Last updated: Feb 2026</span>
              <a href="https://clinicaltrials.gov" target="_blank" rel="noopener noreferrer" className="hover:text-stone-600">ClinicalTrials.gov</a>
              <a href="https://platform.opentargets.org" target="_blank" rel="noopener noreferrer" className="hover:text-stone-600">Open Targets</a>
            </div>
          </div>
        </footer>
      </div>
      <TrialDrillDown nctId={selectedTrialNctId} onClose={() => setSelectedTrialNctId(null)} />
    </TooltipProvider>
  )
}

export default App
