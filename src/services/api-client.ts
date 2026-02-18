/**
 * Backend API client for BiomarkerScope.
 * Replaces static data imports with real API calls.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function fetchJSON<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== 'All') {
        url.searchParams.set(k, v);
      }
    });
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ===== Types matching backend responses =====

export interface PaginatedTrialBiomarkers {
  items: import('../types').TrialBiomarkerUsage[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DashboardStats {
  totalTrials: number;
  totalBiomarkers: number;
  totalAssays: number;
  fdaApprovedAssays: number;
  recruitingCount: number;
  biomarkerCounts: { name: string; value: number }[];
  settingDistribution: { name: string; value: number }[];
  yearDistribution: { year: number; trials: number }[];
  sponsorDistribution: { name: string; value: number }[];
  phaseCounts: { name: string; value: number }[];
  indication: string;
}

export interface IndicationItem {
  name: string;
  displayName: string;
}

export interface IndicationSummary {
  name: string;
  displayName: string;
  trialCount: number;
  biomarkerEntries: number;
  pubmedArticles: number;
  uniqueBiomarkers: number;
  recruitingTrials: number;
}

export interface PubMedArticle {
  pmid: string;
  title: string;
  abstract: string | null;
  authors: string[];
  journal: string | null;
  pubDate: string | null;
  biomarkerMentions: string[];
}

export interface CivicEvidence {
  civicId: number;
  geneName: string;
  variantName: string;
  diseaseName: string;
  evidenceType: string;
  evidenceLevel: string;
  drugs: string[];
}

export interface PipelineSummary {
  totalTrials: number;
  totalBiomarkerEntries: number;
  uniqueBiomarkers: number;
  indications: number;
  openTargetsAssociations: number;
  pubmedArticles: number;
  civicEvidence: number;
  gwasAssociations: number;
}

// ===== API Functions =====

export async function getIndications(): Promise<IndicationItem[]> {
  return fetchJSON<IndicationItem[]>('/indications');
}

export async function getIndicationsSummary(): Promise<IndicationSummary[]> {
  return fetchJSON<IndicationSummary[]>('/indications/summary');
}

export async function getDashboardStats(indication: string): Promise<DashboardStats> {
  return fetchJSON<DashboardStats>(`/dashboard/stats/${encodeURIComponent(indication)}`);
}

export async function getTrialBiomarkers(params: {
  indication?: string;
  biomarker?: string;
  phase?: string;
  setting?: string;
  sponsor?: string;
  status?: string;
  yearFrom?: string;
  yearTo?: string;
  search?: string;
  page?: string;
  pageSize?: string;
}): Promise<PaginatedTrialBiomarkers> {
  return fetchJSON<PaginatedTrialBiomarkers>('/trial-biomarkers', {
    indication: params.indication,
    biomarker: params.biomarker,
    phase: params.phase,
    setting: params.setting,
    sponsor: params.sponsor,
    status: params.status,
    year_from: params.yearFrom,
    year_to: params.yearTo,
    search: params.search,
    page: params.page || '1',
    page_size: params.pageSize || '50',
  });
}

export async function getTrialDetail(nctId: string) {
  return fetchJSON(`/trials/${encodeURIComponent(nctId)}`);
}

export async function getBiomarkers(): Promise<import('../types').Biomarker[]> {
  return fetchJSON('/biomarkers');
}

export async function getAssays(biomarker?: string): Promise<import('../types').AssayInfo[]> {
  return fetchJSON('/assays', { biomarker });
}

export async function getCutoffTrends(
  biomarker?: string,
  indication?: string
): Promise<import('../types').CutoffTrend[]> {
  return fetchJSON('/cutoff-trends', { biomarker, indication });
}

export async function getOpenTargets(
  indication: string
): Promise<import('../types').OpenTargetLink[]> {
  return fetchJSON(`/external/open-targets/${encodeURIComponent(indication)}`);
}

export async function getGWAS(
  indication: string
): Promise<import('../types').GWASAssociation[]> {
  return fetchJSON(`/external/gwas/${encodeURIComponent(indication)}`);
}

export async function getPubMed(indication: string): Promise<PubMedArticle[]> {
  return fetchJSON(`/external/pubmed/${encodeURIComponent(indication)}`);
}

export async function getCivic(gene: string): Promise<CivicEvidence[]> {
  return fetchJSON(`/external/civic/${encodeURIComponent(gene)}`);
}

export async function getPipelineSummary(): Promise<PipelineSummary> {
  return fetchJSON('/pipeline/summary');
}

// ===== Druggability types =====

export interface DruggabilityRow {
  biomarkerSymbol: string;
  overallScore: number;
  drugScore: number;
  cancerBiomarkerScore: number;
  cancerGeneCensusScore: number;
  intogenScore: number;
  literatureScore: number;
  smTractable: boolean;
  smHasApprovedDrug: boolean;
  abTractable: boolean;
  abHasApprovedDrug: boolean;
  protacTractable: boolean;
  uniqueDrugs: number;
  approvedDrugCount: number;
}

export interface KnownDrug {
  drugName: string;
  drugChemblId: string;
  drugType: string;
  maxPhase: number;
  isApproved: boolean;
  yearApproved: number | null;
  mechanismOfAction: string;
  diseaseName: string;
  diseaseEfoId: string;
}

export interface CancerBiomarkerEvidence {
  biomarkerSymbol: string;
  drugName: string | null;
  confidence: string;
  diseaseFromSource: string;
}

export async function getDruggabilityMatrix(indication: string): Promise<DruggabilityRow[]> {
  return fetchJSON(`/druggability/${encodeURIComponent(indication)}`);
}

export async function getDrugsForBiomarker(indication: string, biomarker: string): Promise<KnownDrug[]> {
  return fetchJSON(`/druggability/${encodeURIComponent(indication)}/${encodeURIComponent(biomarker)}/drugs`);
}

export async function getCancerBiomarkerEvidence(indication: string): Promise<CancerBiomarkerEvidence[]> {
  return fetchJSON(`/druggability/${encodeURIComponent(indication)}/evidence`);
}

// ===== Strategy Brief types =====

export interface StrategyBrief {
  biomarker: string;
  indication: string;
  generatedAt: string;
  trialSummary: {
    total: number;
    recruiting: number;
    byPhase: { phase: string; count: number }[];
    topSponsors: { name: string; count: number }[];
    yearTrend: { year: number; count: number }[];
    firstTrialYear: number | null;
    latestTrialYear: number | null;
  };
  cutoffLandscape: {
    dominantCutoffs: { value: string; unit: string; operator: string; count: number }[];
    assaysUsed: { name: string; count: number }[];
    companionDiagnostics: string[];
    cutoffTrends: { year: number; cutoffValue: string; cutoffUnit: string; trialCount: number; dominantAssay: string }[];
  };
  druggability: {
    overallScore: number;
    drugScore: number;
    cancerBiomarkerScore: number;
    cancerGeneCensusScore: number;
    literatureScore: number;
    smTractable: boolean;
    smHasApprovedDrug: boolean;
    abTractable: boolean;
    abHasApprovedDrug: boolean;
    protacTractable: boolean;
    totalDrugCandidates: number;
    totalApproved: number;
    approvedDrugs: { name: string; type: string; yearApproved: number | null; moa: string; phase: number | null }[];
    pipelineDrugs: { name: string; type: string; phase: number | null; moa: string }[];
  };
  evidence: {
    total: number;
    byLevel: Record<string, { biomarker: string; drug: string | null; disease: string }[]>;
  };
  assayLandscape: {
    fdaApproved: { name: string; manufacturer: string; platform: string; cdxFor: string | null }[];
    researchUse: { name: string; manufacturer: string; platform: string }[];
  };
  geneticContext: {
    gwasVariants: { rsId: string; gene: string; trait: string; pValue: number; oddsRatio: number | null; riskAllele: string; population: string; pubmedId: string }[];
    geneSymbols: string[];
  };
  publications: { pmid: string; title: string; journal: string | null; pubDate: string | null; authors: string[] }[];
}

// ===== Opportunity Matrix types =====

export interface OpportunityCell {
  indication: string;
  totalTrials: number;
  recruitingTrials: number;
  phase3Trials: number;
  hasApprovedDrug: boolean;
  hasFdaCdx: boolean;
  otScore: number;
  drugCount: number;
}

export interface OpportunityMatrixRow {
  biomarker: string;
  totalAcrossIndications: number;
  cells: OpportunityCell[];
}

export interface OpportunityMatrixData {
  indications: string[];
  biomarkers: string[];
  matrix: OpportunityMatrixRow[];
  opportunities: {
    biomarker: string;
    indication: string;
    totalTrials: number;
    otScore: number;
    hasApprovedDrug: boolean;
    rationale: string;
  }[];
  generatedAt: string;
}

// ===== Strategy API functions =====

export async function getStrategyBrief(indication: string, biomarker: string): Promise<StrategyBrief> {
  return fetchJSON(`/strategy/brief/${encodeURIComponent(indication)}/${encodeURIComponent(biomarker)}`);
}

export async function getOpportunityMatrix(): Promise<OpportunityMatrixData> {
  return fetchJSON('/strategy/opportunity-matrix');
}

// ===== Enriched Trial Detail types =====

export interface EnrichedTrialBiomarker {
  biomarkerName: string;
  cutoffValue: string | null;
  cutoffUnit: string | null;
  cutoffOperator: string | null;
  assayName: string | null;
  assayPlatform: string | null;
  companionDiagnostic: boolean;
  biomarkerRole: string | null;
  therapeuticSetting: string | null;
  rawSnippet: string | null;
  extractionConfidence: number;
  extractionSource: string | null;
  biomarkerContext: string | null;
}

export interface TrialCrossReference {
  druggability: {
    overallScore: number;
    drugScore: number;
    cancerBiomarkerScore: number;
    smTractable: boolean;
    smHasApprovedDrug: boolean;
    abTractable: boolean;
    abHasApprovedDrug: boolean;
    protacTractable: boolean;
    totalDrugCandidates: number;
    totalApproved: number;
  } | null;
  approvedDrugs: { name: string; type: string; yearApproved: number | null; moa: string; phase: number | null }[];
  cancerEvidence: { biomarker: string; drug: string | null; confidence: string; disease: string }[];
  assays: { name: string; manufacturer: string; platform: string; fdaApproved: boolean; cdxFor: string[] | null }[];
  gwasVariants: { rsId: string; gene: string; trait: string; pValue: number; oddsRatio: number | null; riskAllele: string; population: string; pubmedId: string }[];
  pubmedArticles: { pmid: string; title: string; journal: string | null; pubDate: string | null; authors: string[] }[];
}

export interface EnrichedTrialDetail {
  trial: {
    nctId: string;
    briefTitle: string;
    officialTitle: string | null;
    status: string;
    phase: string;
    sponsor: string;
    sponsorClass: string | null;
    startDate: string | null;
    startYear: number;
    completionDate: string | null;
    enrollmentCount: number | null;
    enrollmentType: string | null;
    briefSummary: string | null;
    eligibilityCriteria: string | null;
    conditions: string[];
    interventions: unknown[];
    primaryOutcomes: unknown[];
    secondaryOutcomes: unknown[];
    allocation: string | null;
    interventionModel: string | null;
    primaryPurpose: string | null;
    masking: string | null;
    sex: string | null;
    minimumAge: string | null;
    maximumAge: string | null;
    studyType: string | null;
  };
  biomarkers: EnrichedTrialBiomarker[];
  indications: { name: string; displayName: string }[];
  crossReferences: Record<string, TrialCrossReference>;
}

export async function getEnrichedTrialDetail(nctId: string): Promise<EnrichedTrialDetail> {
  return fetchJSON<EnrichedTrialDetail>(`/trials/${encodeURIComponent(nctId)}/enriched`);
}

// ===== Biomarker Watch types =====

export interface WatchFeedPublication {
  pmid: string;
  title: string;
  journal: string | null;
  pubDate: string | null;
  authors: string[];
  biomarkerMentions: string[];
  indicationMentions: string[];
}

export interface WatchFeedTrialActivity {
  nctId: string;
  briefTitle: string;
  status: string;
  phase: string;
  startDate: string | null;
  sponsor: string;
  biomarkers: string[];
}

export interface WatchFeedCutoffAlert {
  biomarkerName: string;
  tumorType: string;
  currentYear: number;
  currentCutoff: number;
  cutoffUnit: string;
  previousCutoff: number;
  previousYear: number;
}

export interface WatchFeedApproval {
  drugName: string;
  drugType: string;
  biomarkerSymbol: string;
  indicationName: string;
  yearApproved: number;
  moa: string;
}

export interface WatchFeed {
  publications: WatchFeedPublication[];
  trialActivity: WatchFeedTrialActivity[];
  cutoffAlerts: WatchFeedCutoffAlert[];
  recentApprovals: WatchFeedApproval[];
  generatedAt: string;
}

export interface BiomarkerWatchDetail {
  biomarker: string;
  publications: { pmid: string; title: string; journal: string | null; pubDate: string | null; authors: string[] }[];
  recentTrials: { nctId: string; briefTitle: string; status: string; phase: string; startDate: string | null; sponsor: string; cutoffValue: string; cutoffUnit: string }[];
  cutoffChanges: { year: number; cutoffValue: number; cutoffUnit: string; trialCount: number; dominantAssay: string; tumorType: string }[];
  drugPipeline: { drugName: string; drugType: string; maxPhase: number; isApproved: boolean; yearApproved: number | null; moa: string; indicationName: string }[];
  whiteSpaceSignals: { indicationName: string; overallScore: number; uniqueDrugs: number; trialCount: number }[];
  generatedAt: string;
}

export async function getWatchFeed(indication?: string): Promise<WatchFeed> {
  return fetchJSON<WatchFeed>('/watch/feed', { indication });
}

export async function getBiomarkerWatch(biomarker: string, indication?: string): Promise<BiomarkerWatchDetail> {
  return fetchJSON<BiomarkerWatchDetail>(`/watch/biomarker/${encodeURIComponent(biomarker)}`, { indication });
}

// ===== Research Report SSE types =====

export type ReportSSEEvent =
  | { type: 'step'; id: string; status: 'running' | 'complete' | 'error'; label: string; duration_ms?: number; summary?: string }
  | { type: 'section_start'; section: string; title: string }
  | { type: 'token'; content: string }
  | { type: 'section_end'; section: string }
  | { type: 'citation'; id: string; source: string; ref_type: string; ref_id: string; display: string }
  | { type: 'done'; total_duration_ms: number }
  | { type: 'error'; message: string };

export interface AgentStep {
  id: string;
  label: string;
  status: 'running' | 'complete' | 'error';
  duration_ms?: number;
  summary?: string;
  startedAt: number;
}

export interface ReportCitation {
  id: string;
  source: string;
  ref_type: string;
  ref_id: string;
  display: string;
}
