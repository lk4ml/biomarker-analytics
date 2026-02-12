import { useState, useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  Cell, PieChart, Pie, AreaChart, Area
} from 'recharts'
import {
  FlaskConical, TrendingUp, Dna, Newspaper,
  Filter, ExternalLink, BarChart3,
  TestTube2, CircleDot, Beaker, ArrowUpRight,
  Database, Microscope, Zap, Search, Loader2,
  Building2, Shield, Combine, AlertTriangle
} from 'lucide-react'
import { BIOMARKERS, TRIAL_USAGES, CUTOFF_TRENDS, ASSAYS, GWAS_ASSOCIATIONS, OPEN_TARGET_LINKS, NEWS_UPDATES, TUMOR_TYPES } from './data/biomarker-data'
import { LIVE_TRIALS, LIVE_NEWS } from './data/live-data'
import { useLiveTrials } from './hooks/use-api-data'
import { CompetitiveLandscape, CutoffAdvisor, CdxGapAnalyzer, CombinationExplorer, EvidenceGrading } from './components/features'
import type { FilterState } from './types'

// Merge static + live data
const ALL_TRIALS = [...TRIAL_USAGES, ...LIVE_TRIALS]
const ALL_NEWS = [...LIVE_NEWS, ...NEWS_UPDATES]

const COLORS = ['#0ea5e9', '#f97316', '#22c55e', '#a855f7', '#ef4444', '#eab308', '#06b6d4', '#ec4899', '#14b8a6', '#f59e0b', '#6366f1', '#84cc16']

// Map indications to their dominant biomarkers for filtering assays/GWAS
const INDICATION_BIOMARKER_MAP: Record<string, string[]> = {
  'NSCLC': ['PD-L1', 'TMB', 'EGFR', 'ALK', 'KRAS', 'BRAF', 'NTRK', 'HER2', 'ctDNA'],
  'Breast Cancer': ['PD-L1', 'HER2', 'BRCA1/2', 'ctDNA', 'TILs', 'ER', 'PR', 'PIK3CA', 'Ki-67'],
  'Melanoma': ['PD-L1', 'TMB', 'BRAF', 'ctDNA', 'TILs', 'NTRK'],
  'Colorectal Cancer': ['MSI', 'KRAS', 'BRAF', 'ctDNA', 'HER2', 'NTRK'],
  'Urothelial Carcinoma': ['PD-L1', 'TMB', 'EGFR', 'ctDNA'],
  'Head & Neck SCC': ['PD-L1', 'TMB', 'HPV'],
  'Gastric Cancer': ['PD-L1', 'HER2', 'MSI'],
  'Hepatocellular Carcinoma': ['PD-L1', 'ctDNA'],
  'Renal Cell Carcinoma': ['PD-L1', 'TMB'],
  'Ovarian Cancer': ['BRCA1/2', 'HER2', 'PD-L1', 'ctDNA'],
  'Endometrial Cancer': ['MSI', 'PD-L1', 'TMB'],
  'Prostate Cancer': ['BRCA1/2', 'TMB', 'MSI', 'ctDNA'],
  'Pancreatic Cancer': ['BRCA1/2', 'KRAS', 'MSI', 'NTRK'],
  'Cervical Cancer': ['PD-L1'],
}

// Map indications to Open Targets disease names for filtering
const INDICATION_OT_MAP: Record<string, string[]> = {
  'NSCLC': ['Non-small cell lung carcinoma'],
  'Breast Cancer': ['Breast carcinoma'],
  'Melanoma': ['Melanoma'],
  'Colorectal Cancer': ['Colorectal carcinoma'],
  'Ovarian Cancer': ['Ovarian carcinoma'],
}

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

  // Live API data: fetch trials from ClinicalTrials.gov when an indication is selected
  // Memoize to prevent new array/object references on every render
  const currentBiomarkers = useMemo(() =>
    selectedIndication !== 'all'
      ? INDICATION_BIOMARKER_MAP[selectedIndication] || []
      : [],
    [selectedIndication]
  )

  const liveOptions = useMemo(() => ({
    status: ['RECRUITING', 'ACTIVE_NOT_RECRUITING', 'COMPLETED'] as string[],
    phase: ['PHASE1', 'PHASE2', 'PHASE3'] as string[],
    pageSize: 50,
    enabled: selectedIndication !== 'all',
  }), [selectedIndication])

  const liveData = useLiveTrials(
    selectedIndication !== 'all' ? selectedIndication : null,
    currentBiomarkers,
    liveOptions
  )

  // Available indications — only those that have trial data
  const availableIndications = useMemo(() => {
    const indicationsWithTrials = TUMOR_TYPES.filter(tt =>
      ALL_TRIALS.some(t => t.tumorType === tt)
    )
    return indicationsWithTrials
  }, [])

  // All filtering starts from selected indication — merge static + live API data
  const indicationTrials = useMemo(() => {
    if (selectedIndication === 'all') return ALL_TRIALS
    const staticTrials = ALL_TRIALS.filter(t => t.tumorType === selectedIndication)
    // Merge live API trials, dedup by NCT ID
    const existingNCTIds = new Set(staticTrials.map(t => t.nctId))
    const newLiveTrials = liveData.trials.filter(t => !existingNCTIds.has(t.nctId))
    return [...staticTrials, ...newLiveTrials]
  }, [selectedIndication, liveData.trials])

  const indicationBiomarkers = useMemo(() => {
    if (selectedIndication === 'all') return BIOMARKERS
    const relevantNames = INDICATION_BIOMARKER_MAP[selectedIndication] || []
    return BIOMARKERS.filter(b => relevantNames.includes(b.name))
  }, [selectedIndication])

  const indicationAssays = useMemo(() => {
    if (selectedIndication === 'all') return ASSAYS
    const relevantBiomarkers = INDICATION_BIOMARKER_MAP[selectedIndication] || []
    return ASSAYS.filter(a => a.biomarkers.some(b => relevantBiomarkers.includes(b)))
  }, [selectedIndication])

  const indicationGWAS = useMemo(() => {
    if (selectedIndication === 'all') return GWAS_ASSOCIATIONS
    const relevantBiomarkers = INDICATION_BIOMARKER_MAP[selectedIndication] || []
    return GWAS_ASSOCIATIONS.filter(g => {
      // Match on biomarker relevance text or gene name
      return relevantBiomarkers.some(b =>
        g.biomarkerRelevance.includes(b) || g.gene.includes(b)
      )
    })
  }, [selectedIndication])

  const indicationOpenTargets = useMemo(() => {
    if (selectedIndication === 'all') return OPEN_TARGET_LINKS
    const diseaseNames = INDICATION_OT_MAP[selectedIndication] || []
    if (diseaseNames.length === 0) {
      // Fallback: filter by relevant biomarker target names
      const relevantBiomarkers = INDICATION_BIOMARKER_MAP[selectedIndication] || []
      return OPEN_TARGET_LINKS.filter(ot =>
        relevantBiomarkers.some(b => ot.targetName.includes(b))
      )
    }
    return OPEN_TARGET_LINKS.filter(ot => diseaseNames.includes(ot.diseaseName))
  }, [selectedIndication])

  const indicationCutoffTrends = useMemo(() => {
    if (selectedIndication === 'all') return CUTOFF_TRENDS
    return CUTOFF_TRENDS.filter(c => c.tumorType === selectedIndication)
  }, [selectedIndication])

  const indicationNews = useMemo(() => {
    if (selectedIndication === 'all') return ALL_NEWS
    const relevantBiomarkers = INDICATION_BIOMARKER_MAP[selectedIndication] || []
    return ALL_NEWS.filter(n =>
      n.biomarkers.some(b => relevantBiomarkers.includes(b)) ||
      n.tags.some(t => t.toLowerCase().includes(selectedIndication.toLowerCase())) ||
      n.title.toLowerCase().includes(selectedIndication.toLowerCase()) ||
      n.summary.toLowerCase().includes(selectedIndication.toLowerCase())
    )
  }, [selectedIndication])

  // Sub-filtering within indication (trial table filters)
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
  // uniqueTumorTypes derived from selection - TUMOR_TYPES used directly in JSX

  // Unique trial count (by NCT ID) — a single trial may appear multiple times for different biomarkers
  const uniqueTrialNCTIds = new Set(indicationTrials.map(t => t.nctId))
  const totalTrials = uniqueTrialNCTIds.size

  // Count trials from live sources (curated LIVE_TRIALS + API) — no double-counting
  const curatedLiveNCTs = new Set(LIVE_TRIALS.map(t => t.nctId))
  const apiLiveNCTs = new Set(liveData.trials.map(t => t.nctId))
  const liveTrialCount = [...uniqueTrialNCTIds].filter(nctId =>
    curatedLiveNCTs.has(nctId) || apiLiveNCTs.has(nctId)
  ).length

  // Unique API-fetched trials count
  const uniqueApiCount = liveData.totalCount
  const totalBiomarkers = indicationBiomarkers.length
  const totalAssays = indicationAssays.length
  const fdaApprovedAssays = indicationAssays.filter(a => a.fdaApproved).length
  const recruitingCount = indicationTrials.filter(t => t.status === 'Recruiting').length

  const biomarkerCounts = uniqueBiomarkers.map(b => ({
    name: b,
    value: indicationTrials.filter(t => t.biomarkerName === b).length
  })).sort((a, b) => b.value - a.value)

  const tumorTypeCounts = TUMOR_TYPES.map(tt => ({
    name: tt.length > 12 ? tt.substring(0, 12) + '...' : tt,
    fullName: tt,
    trials: indicationTrials.filter(t => t.tumorType === tt).length
  })).filter(t => t.trials > 0).sort((a, b) => b.trials - a.trials)

  const yearDist = Array.from({ length: 14 }, (_, i) => {
    const year = 2013 + i
    return {
      year,
      trials: indicationTrials.filter(t => t.startYear === year).length
    }
  }).filter(y => y.trials > 0)

  // Setting distribution for selected indication
  const settingDist = useMemo(() => {
    const settings = [...new Set(indicationTrials.map(t => t.setting))]
    return settings.map(s => ({
      name: s,
      value: indicationTrials.filter(t => t.setting === s).length
    })).sort((a, b) => b.value - a.value)
  }, [indicationTrials])

  // Sponsor distribution
  const sponsorDist = useMemo(() => {
    const sponsors: Record<string, number> = {}
    indicationTrials.forEach(t => {
      sponsors[t.sponsor] = (sponsors[t.sponsor] || 0) + 1
    })
    return Object.entries(sponsors)
      .map(([name, value]) => ({ name: name.length > 18 ? name.substring(0, 18) + '...' : name, fullName: name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [indicationTrials])

  // Cutoff trend biomarkers computed in trendChartData below

  // Build dynamic cutoff trend charts per biomarker for the indication
  const trendChartData = useMemo(() => {
    const charts: { biomarker: string; tumorType: string; data: typeof CUTOFF_TRENDS; insight: string }[] = []
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

  // Landing page — shown when no indication is selected
  if (selectedIndication === 'all') {
    return (
      <TooltipProvider>
        <div className="min-h-screen bg-gradient-to-br from-stone-50 via-sky-50 to-stone-50 text-stone-900">
          {/* HEADER */}
          <header className="border-b border-stone-200 bg-white/80 backdrop-blur">
            <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-sky-600 rounded flex items-center justify-center">
                  <Microscope className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold tracking-tight">BiomarkerScope</h1>
                  <p className="text-xs text-stone-500">Oncology Biomarker Analytics Platform</p>
                </div>
              </div>
              <Badge className="bg-emerald-600 text-white text-xs animate-pulse">
                <Database className="w-3 h-3 mr-1" />
                LIVE — {LIVE_TRIALS.length} trials from CT.gov
              </Badge>
            </div>
          </header>

          {/* HERO SECTION */}
          <div className="max-w-[1400px] mx-auto px-6 pt-12 pb-6 text-center">
            <div className="inline-flex items-center gap-2 bg-sky-100 text-sky-700 px-4 py-1.5 rounded-full text-xs font-medium mb-6">
              <Database className="w-3.5 h-3.5" />
              {ALL_TRIALS.length} biomarker-driven trials across {availableIndications.length} indications
            </div>
            <h2 className="text-3xl font-bold text-stone-900 mb-3">Select Your Indication</h2>
            <p className="text-base text-stone-500 max-w-xl mx-auto mb-10">
              Choose a disease area to explore biomarker usage, cutoff trends, assay platforms, GWAS associations, and the latest updates.
            </p>

            {/* INDICATION GRID */}
            <div className="grid grid-cols-4 gap-3 max-w-[1100px] mx-auto mb-8">
              {availableIndications.map(indication => {
                const trialCount = ALL_TRIALS.filter(t => t.tumorType === indication).length
                const biomarkers = INDICATION_BIOMARKER_MAP[indication] || []
                const liveCount = LIVE_TRIALS.filter(t => t.tumorType === indication).length
                const recruitingCnt = ALL_TRIALS.filter(t => t.tumorType === indication && t.status === 'Recruiting').length
                return (
                  <button
                    key={indication}
                    onClick={() => setSelectedIndication(indication)}
                    className={`text-left p-4 rounded-lg border-2 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer ${
                      INDICATION_COLORS[indication] || 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <div className="text-sm font-bold mb-1">{indication}</div>
                    <div className="text-xl font-bold mb-2">{trialCount} <span className="text-xs font-normal opacity-70">trials</span></div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {biomarkers.slice(0, 4).map(b => (
                        <span key={b} className="text-[9px] px-1.5 py-0.5 rounded bg-white/60 font-medium">{b}</span>
                      ))}
                      {biomarkers.length > 4 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/60 font-medium">+{biomarkers.length - 4}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] opacity-70">
                      {liveCount > 0 && <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> {liveCount} live</span>}
                      {recruitingCnt > 0 && <span>{recruitingCnt} recruiting</span>}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Quick stats footer */}
            <div className="flex items-center justify-center gap-8 text-xs text-stone-400 pt-4 border-t border-stone-200 max-w-lg mx-auto">
              <span>{BIOMARKERS.length} biomarkers tracked</span>
              <span>{ASSAYS.length} assay platforms</span>
              <span>{GWAS_ASSOCIATIONS.length} GWAS associations</span>
              <span>{ALL_NEWS.length} news updates</span>
            </div>
          </div>

          <footer className="border-t border-stone-200 bg-white mt-8">
            <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
              <p className="text-[10px] text-stone-400">BiomarkerScope — Oncology Biomarker Analytics. Data from ClinicalTrials.gov, PubMed, GWAS Catalog &amp; Open Targets.</p>
              <div className="flex items-center gap-3 text-[10px] text-stone-400">
                <span>Last updated: Feb 2026</span>
                <a href="https://clinicaltrials.gov" target="_blank" rel="noopener noreferrer" className="hover:text-stone-600">ClinicalTrials.gov</a>
                <a href="https://www.ebi.ac.uk/gwas/" target="_blank" rel="noopener noreferrer" className="hover:text-stone-600">GWAS Catalog</a>
                <a href="https://platform.opentargets.org" target="_blank" rel="noopener noreferrer" className="hover:text-stone-600">Open Targets</a>
              </div>
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
              {liveData.loading && (
                <Badge className="bg-sky-600 text-white text-xs">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Fetching live data...
                </Badge>
              )}
              <Badge className="bg-emerald-600 text-white text-xs animate-pulse">
                <Database className="w-3 h-3 mr-1" />
                LIVE — {totalTrials} trials{uniqueApiCount > 0 ? ` (${uniqueApiCount} from CT.gov API)` : ''}
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
                  {liveData.lastUpdated && (
                    <span className="ml-1">· Updated {liveData.lastUpdated.toLocaleTimeString()}</span>
                  )}
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
                {liveData.loading && <Loader2 className="w-3 h-3 animate-spin" />}
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
              <TabsTrigger value="evidence" className="gap-1.5 text-xs">
                <Shield className="w-3.5 h-3.5" /> Evidence Grading
              </TabsTrigger>
              <TabsTrigger value="assays" className="gap-1.5 text-xs">
                <TestTube2 className="w-3.5 h-3.5" /> Assays &amp; CDx
              </TabsTrigger>
              <TabsTrigger value="gwas" className="gap-1.5 text-xs">
                <Dna className="w-3.5 h-3.5" /> GWAS &amp; Genetics
              </TabsTrigger>
              <TabsTrigger value="news" className="gap-1.5 text-xs">
                <Newspaper className="w-3.5 h-3.5" /> Latest Updates
              </TabsTrigger>
            </TabsList>

            {/* DASHBOARD TAB */}
            <TabsContent value="dashboard">
              <div className="grid grid-cols-5 gap-4 mb-5">
                {[
                  { label: 'Biomarkers', value: totalBiomarkers, icon: CircleDot, color: 'text-sky-600' },
                  { label: `Trials (${liveTrialCount} live)`, value: totalTrials, icon: FlaskConical, color: 'text-orange-600' },
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
                    <CardDescription className="text-xs">Trials per biomarker</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={biomarkerCounts} cx="50%" cy="50%" outerRadius={90} innerRadius={40} paddingAngle={2} dataKey="value" label={({ name, value }) => `${name} (${value})`} labelLine={true} style={{ fontSize: '10px' }}>
                          {biomarkerCounts.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                      </PieChart>
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

              <Card className="border-stone-200">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">Latest Biomarker Updates{selectedIndication !== 'all' ? ` — ${selectedIndication}` : ''}</CardTitle>
                      <CardDescription className="text-xs">Recent developments from FDA, ASCO, ESMO &amp; PubMed</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => setActiveTab('news')}>
                      View All <ArrowUpRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {indicationNews.slice(0, 5).map(n => (
                      <div key={n.id} className="flex items-start gap-3 p-3 rounded-md bg-stone-50 hover:bg-stone-100 transition-colors">
                        <Badge variant={n.source === 'FDA' ? 'default' : 'outline'} className="mt-0.5 shrink-0 text-[10px]">{n.source}</Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-snug">{n.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-stone-400">{n.date}</span>
                            {n.biomarkers.map(b => <Badge key={b} variant="outline" className="text-[10px] py-0">{b}</Badge>)}
                          </div>
                        </div>
                      </div>
                    ))}
                    {indicationNews.length === 0 && (
                      <p className="text-xs text-stone-400 text-center py-6">No updates found for this indication. Try "All Indications" for a complete view.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
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
                            <a href={`https://clinicaltrials.gov/study/${trial.nctId}`} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">
                              {trial.nctId} <ExternalLink className="w-2.5 h-2.5" />
                            </a>
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
                loading={liveData.loading}
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

            {/* EVIDENCE GRADING TAB (Feature 8) */}
            <TabsContent value="evidence">
              <EvidenceGrading
                trials={indicationTrials}
                assays={indicationAssays}
                indication={selectedIndication}
                biomarkers={uniqueBiomarkers}
              />
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

            {/* GWAS & GENETICS TAB */}
            <TabsContent value="gwas">
              <div className="grid grid-cols-2 gap-4">
                <Card className="border-stone-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">GWAS Associations{selectedIndication !== 'all' ? ` — ${selectedIndication}` : ''}</CardTitle>
                    <CardDescription className="text-xs">Germline variants influencing biomarker biology (NHGRI-EBI GWAS Catalog)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[480px]">
                      <div className="space-y-3">
                        {indicationGWAS.map((g, i) => (
                          <div key={i} className="p-3 border border-stone-200 rounded-md hover:border-stone-300 transition-colors">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="font-mono text-[10px]">{g.rsId}</Badge>
                                <span className="text-xs font-semibold text-sky-700">{g.gene}</span>
                              </div>
                              <span className="text-[10px] text-stone-400">p = {g.pValue.toExponential(1)}</span>
                            </div>
                            <p className="text-xs text-stone-700 font-medium mb-1">{g.traitName}</p>
                            <p className="text-[11px] text-stone-500 leading-relaxed mb-2">{g.biomarkerRelevance}</p>
                            <div className="flex items-center gap-2 text-[10px] text-stone-400">
                              {g.oddsRatio && <span>OR: {g.oddsRatio}</span>}
                              <span>Risk: {g.riskAllele}</span>
                              <span>Pop: {g.population}</span>
                              <a href={`https://pubmed.ncbi.nlm.nih.gov/${g.pubmedId}`} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline flex items-center gap-0.5">
                                PMID:{g.pubmedId} <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                          </div>
                        ))}
                        {indicationGWAS.length === 0 && (
                          <p className="text-xs text-stone-400 text-center py-8">No GWAS associations found for this indication's biomarkers.</p>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card className="border-stone-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Open Targets Association Scores{selectedIndication !== 'all' ? ` — ${selectedIndication}` : ''}</CardTitle>
                    <CardDescription className="text-xs">Target-disease evidence from Open Targets Platform</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[480px]">
                      <div className="space-y-4">
                        {indicationOpenTargets.map((ot, i) => (
                          <div key={i} className="p-3 border border-stone-200 rounded-md">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <span className="text-xs font-semibold">{ot.targetName}</span>
                                <span className="text-[10px] text-stone-400 ml-2">→ {ot.diseaseName}</span>
                              </div>
                              <Badge className="text-[10px]">Score: {ot.associationScore.toFixed(2)}</Badge>
                            </div>
                            <div className="space-y-1.5">
                              {Object.entries(ot.datatypeScores).map(([key, val]) => (
                                <div key={key} className="flex items-center gap-2">
                                  <span className="text-[10px] text-stone-500 w-28 text-right capitalize">{key.replace(/_/g, ' ')}</span>
                                  <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all"
                                      style={{
                                        width: `${val * 100}%`,
                                        backgroundColor: val > 0.8 ? '#22c55e' : val > 0.5 ? '#eab308' : '#ef4444'
                                      }}
                                    />
                                  </div>
                                  <span className="text-[10px] text-stone-400 w-8">{(val * 100).toFixed(0)}%</span>
                                </div>
                              ))}
                            </div>
                            <div className="mt-2 flex gap-1">
                              <a href={`https://platform.opentargets.org/target/${ot.targetId}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-sky-600 hover:underline flex items-center gap-0.5">
                                Open Targets <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                          </div>
                        ))}
                        {indicationOpenTargets.length === 0 && (
                          <p className="text-xs text-stone-400 text-center py-8">No Open Targets associations found for this indication.</p>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* NEWS TAB */}
            <TabsContent value="news">
              <div className="grid grid-cols-1 gap-3">
                {indicationNews.map(n => (
                  <Card key={n.id} className="border-stone-200 hover:border-stone-300 transition-colors">
                    <CardContent className="py-4">
                      <div className="flex items-start gap-4">
                        <div className="shrink-0 flex flex-col items-center gap-1">
                          <Badge variant={n.source === 'FDA' ? 'default' : n.source === 'ASCO' ? 'secondary' : 'outline'} className="text-[10px] w-14 justify-center">{n.source}</Badge>
                          <span className="text-[10px] text-stone-400">{n.date}</span>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold leading-snug mb-1.5">{n.title}</h3>
                          <p className="text-xs text-stone-600 leading-relaxed mb-2">{n.summary}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            {n.biomarkers.map(b => <Badge key={b} variant="outline" className="text-[10px]">{b}</Badge>)}
                            <Separator orientation="vertical" className="h-3" />
                            {n.tags.map(t => <Badge key={t} variant="secondary" className="text-[10px] py-0">{t}</Badge>)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {indicationNews.length === 0 && (
                  <Card className="border-stone-200">
                    <CardContent className="py-12 text-center">
                      <Newspaper className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                      <p className="text-sm text-stone-500">No updates found for {selectedIndication}.</p>
                      <p className="text-xs text-stone-400 mt-1">Select "All Indications" for the full news feed.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </main>

        <footer className="border-t border-stone-200 bg-white mt-8">
          <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
            <p className="text-[10px] text-stone-400">BiomarkerScope — Oncology Biomarker Analytics. Data from ClinicalTrials.gov, PubMed, GWAS Catalog &amp; Open Targets.</p>
            <div className="flex items-center gap-3 text-[10px] text-stone-400">
              <span>Last updated: Feb 2026</span>
              <a href="https://clinicaltrials.gov" target="_blank" rel="noopener noreferrer" className="hover:text-stone-600">ClinicalTrials.gov</a>
              <a href="https://www.ebi.ac.uk/gwas/" target="_blank" rel="noopener noreferrer" className="hover:text-stone-600">GWAS Catalog</a>
              <a href="https://platform.opentargets.org" target="_blank" rel="noopener noreferrer" className="hover:text-stone-600">Open Targets</a>
            </div>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  )
}

export default App
