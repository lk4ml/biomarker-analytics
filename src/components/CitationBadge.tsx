import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ExternalLink } from 'lucide-react'

interface Props {
  source: string
  version?: string | null
  accessed?: string | null
  url?: string
  compact?: boolean
}

const SOURCE_COLORS: Record<string, string> = {
  cbioportal: 'bg-sky-100 text-sky-700 border-sky-200',
  oncokb: 'bg-violet-100 text-violet-700 border-violet-200',
  openfda: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  clinicaltrials: 'bg-amber-100 text-amber-700 border-amber-200',
  civic: 'bg-rose-100 text-rose-700 border-rose-200',
  pubmed: 'bg-orange-100 text-orange-700 border-orange-200',
  gwas: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  oncokb_curated: 'bg-violet-100 text-violet-700 border-violet-200',
}

const SOURCE_LABELS: Record<string, string> = {
  cbioportal: 'cBioPortal',
  oncokb: 'OncoKB',
  oncokb_curated: 'OncoKB',
  openfda: 'OpenFDA',
  clinicaltrials: 'CT.gov',
  civic: 'CIViC',
  pubmed: 'PubMed',
  gwas: 'GWAS Catalog',
}

export default function CitationBadge({ source, version, accessed, url, compact }: Props) {
  const colors = SOURCE_COLORS[source] || 'bg-stone-100 text-stone-700 border-stone-200'
  const label = SOURCE_LABELS[source] || source

  const badge = (
    <Badge
      variant="outline"
      className={`${colors} text-[9px] font-medium py-0 px-1.5 border cursor-default ${url ? 'cursor-pointer hover:opacity-80' : ''}`}
      onClick={url ? () => window.open(url, '_blank') : undefined}
    >
      {compact ? label.slice(0, 3) : label}
      {url && <ExternalLink className="w-2 h-2 ml-0.5" />}
    </Badge>
  )

  if (!version && !accessed) return badge

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <p className="font-semibold">{label}</p>
          {version && <p className="text-stone-400">Version: {version}</p>}
          {accessed && <p className="text-stone-400">Accessed: {accessed}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
