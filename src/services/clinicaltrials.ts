// ClinicalTrials.gov API v2 Service
// Docs: https://clinicaltrials.gov/data-api/api

const CT_GOV_BASE = 'https://clinicaltrials.gov/api/v2';

// CORS proxy needed because CT.gov API doesn't send Access-Control-Allow-Origin headers
// Try multiple proxies in sequence for resilience
const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

async function proxyFetch(url: string): Promise<Response> {
  let lastError: Error | null = null;

  for (const makeProxyUrl of CORS_PROXIES) {
    try {
      const proxied = makeProxyUrl(url);
      const response = await fetch(proxied);
      if (response.ok) return response;
      // If proxy returns error, try next
      lastError = new Error(`Proxy returned ${response.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  // Last resort: try direct (will fail with CORS in browser but works in some environments)
  try {
    return await fetch(url);
  } catch {
    throw lastError || new Error('All CORS proxies failed');
  }
}

export interface CTStudy {
  protocolSection: {
    identificationModule: {
      nctId: string;
      briefTitle: string;
      officialTitle?: string;
      organization?: { fullName: string };
    };
    statusModule: {
      overallStatus: string;
      startDateStruct?: { date: string };
      completionDateStruct?: { date: string };
    };
    descriptionModule?: {
      briefSummary?: string;
    };
    conditionsModule?: {
      conditions?: string[];
      keywords?: string[];
    };
    designModule?: {
      studyType?: string;
      phases?: string[];
      enrollmentInfo?: { count: number; type: string };
      designInfo?: {
        allocation?: string;
        interventionModel?: string;
        primaryPurpose?: string;
        maskingInfo?: { masking?: string };
      };
    };
    armsInterventionsModule?: {
      interventions?: Array<{
        type: string;
        name: string;
        description?: string;
      }>;
    };
    outcomesModule?: {
      primaryOutcomes?: Array<{
        measure: string;
        timeFrame?: string;
      }>;
      secondaryOutcomes?: Array<{
        measure: string;
        timeFrame?: string;
      }>;
    };
    eligibilityModule?: {
      eligibilityCriteria?: string;
      sex?: string;
      minimumAge?: string;
      maximumAge?: string;
    };
    contactsLocationsModule?: {
      locations?: Array<{
        facility?: string;
        city?: string;
        state?: string;
        country?: string;
      }>;
    };
    sponsorCollaboratorsModule?: {
      leadSponsor?: { name: string; class?: string };
      collaborators?: Array<{ name: string; class?: string }>;
    };
  };
}

export interface CTSearchResponse {
  studies: CTStudy[];
  totalCount: number;
  nextPageToken?: string;
}

// Map oncology conditions to ClinicalTrials.gov search terms
const CONDITION_SEARCH_MAP: Record<string, string> = {
  'NSCLC': 'non-small cell lung cancer',
  'Breast Cancer': 'breast cancer',
  'Melanoma': 'melanoma',
  'Colorectal Cancer': 'colorectal cancer',
  'Urothelial Carcinoma': 'urothelial carcinoma OR bladder cancer',
  'Head & Neck SCC': 'head and neck squamous cell carcinoma',
  'Gastric Cancer': 'gastric cancer OR stomach cancer',
  'Hepatocellular Carcinoma': 'hepatocellular carcinoma OR liver cancer',
  'Renal Cell Carcinoma': 'renal cell carcinoma OR kidney cancer',
  'Ovarian Cancer': 'ovarian cancer',
  'Endometrial Cancer': 'endometrial cancer OR uterine cancer',
  'Prostate Cancer': 'prostate cancer',
  'Pancreatic Cancer': 'pancreatic cancer',
  'Cervical Cancer': 'cervical cancer',
};

const BIOMARKER_SEARCH_TERMS: Record<string, string> = {
  'PD-L1': 'PD-L1 OR PDL1 OR CD274',
  'TMB': 'tumor mutational burden OR TMB',
  'MSI': 'microsatellite instability OR MSI-H OR dMMR',
  'HER2': 'HER2 OR ERBB2 OR trastuzumab deruxtecan',
  'EGFR': 'EGFR mutation',
  'ALK': 'ALK fusion OR ALK rearrangement',
  'BRCA1/2': 'BRCA1 OR BRCA2 OR BRCA mutation',
  'KRAS': 'KRAS',
  'BRAF': 'BRAF V600 OR BRAF mutation',
  'NTRK': 'NTRK fusion',
  'ctDNA': 'ctDNA OR circulating tumor DNA OR cell-free DNA OR MRD',
  'TILs': 'tumor infiltrating lymphocytes OR TILs',
  'ER': 'estrogen receptor OR ER-positive OR ER+ OR ESR1',
  'PR': 'progesterone receptor OR PR-positive OR PR+ OR PGR',
  'PIK3CA': 'PIK3CA mutation OR PI3K inhibitor OR alpelisib',
  'Ki-67': 'Ki-67 OR Ki67 OR MIB-1 OR proliferation index',
};

export async function searchTrials(params: {
  condition?: string;
  biomarker?: string;
  phase?: string[];
  status?: string[];
  pageSize?: number;
  pageToken?: string;
  sponsor?: string;
  startDateFrom?: string;  // e.g. '2016-01-01' — only trials started after this date
  studyType?: string;      // e.g. 'INTERVENTIONAL' — filter by study type
}): Promise<CTSearchResponse> {
  const urlParams = new URLSearchParams();

  // Use query.cond for disease/condition ONLY
  if (params.condition) {
    const mapped = CONDITION_SEARCH_MAP[params.condition] || params.condition;
    urlParams.set('query.cond', mapped);
  }
  // Use query.term for biomarker/intervention — this searches title, summary, eligibility, interventions
  if (params.biomarker) {
    const mapped = BIOMARKER_SEARCH_TERMS[params.biomarker] || params.biomarker;
    urlParams.set('query.term', mapped);
  }
  if (params.phase && params.phase.length > 0) {
    urlParams.set('filter.phase', params.phase.join(','));
  }
  if (params.status && params.status.length > 0) {
    urlParams.set('filter.overallStatus', params.status.join(','));
  }
  if (params.sponsor) {
    urlParams.set('query.spons', params.sponsor);
  }

  // Advanced filters: date range and study type
  const advancedFilters: string[] = [];
  if (params.startDateFrom) {
    advancedFilters.push(`AREA[StartDate]RANGE[${params.startDateFrom},MAX]`);
  }
  if (params.studyType) {
    advancedFilters.push(`AREA[StudyType]${params.studyType}`);
  }
  if (advancedFilters.length > 0) {
    urlParams.set('filter.advanced', advancedFilters.join(' AND '));
  }

  urlParams.set('pageSize', String(params.pageSize || 50));
  urlParams.set('countTotal', 'true');
  if (params.pageToken) {
    urlParams.set('pageToken', params.pageToken);
  }

  // Request fields needed for NLP extraction — includes eligibility criteria & interventions
  urlParams.set('fields', [
    'NCTId', 'BriefTitle', 'OfficialTitle', 'OverallStatus',
    'Phase', 'StartDate', 'CompletionDate', 'LeadSponsorName',
    'LeadSponsorClass', 'Condition', 'Keyword', 'InterventionName',
    'InterventionType', 'InterventionDescription', 'EnrollmentCount', 'EnrollmentType',
    'BriefSummary', 'EligibilityCriteria', 'Sex', 'MinimumAge', 'MaximumAge',
    'PrimaryOutcomeMeasure', 'PrimaryOutcomeTimeFrame',
    'SecondaryOutcomeMeasure', 'SecondaryOutcomeTimeFrame',
    'LocationFacility', 'LocationCity', 'LocationState', 'LocationCountry',
    'CollaboratorName', 'CollaboratorClass',
    'DesignAllocation', 'DesignInterventionModel', 'DesignPrimaryPurpose', 'DesignMasking',
  ].join(','));

  try {
    const fullUrl = `${CT_GOV_BASE}/studies?${urlParams.toString()}`;
    const response = await proxyFetch(fullUrl);
    if (!response.ok) {
      throw new Error(`ClinicalTrials.gov API error: ${response.status} ${response.statusText}`);
    }
    const json = await response.json();
    // Normalize response — CT.gov API may not include totalCount
    return {
      studies: json.studies || [],
      totalCount: json.totalCount ?? json.studies?.length ?? 0,
      nextPageToken: json.nextPageToken,
    };
  } catch (err) {
    console.warn('[CT.gov API] Fetch failed, returning empty results:', err);
    return { studies: [], totalCount: 0 };
  }
}

export async function getStudyByNCTId(nctId: string): Promise<CTStudy | null> {
  try {
    const fullUrl = `${CT_GOV_BASE}/studies/${nctId}`;
    const response = await proxyFetch(fullUrl);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`ClinicalTrials.gov API error: ${response.status}`);
    }
    return response.json();
  } catch (err) {
    console.warn('[CT.gov API] getStudyByNCTId failed:', err);
    return null;
  }
}

// Search trials specifically for biomarker + condition combinations
export async function searchBiomarkerTrials(
  condition: string,
  biomarkers: string[],
  options?: {
    phase?: string[];
    status?: string[];
    pageSize?: number;
  }
): Promise<CTSearchResponse> {
  const conditionTerm = CONDITION_SEARCH_MAP[condition] || condition;
  const biomarkerTerms = biomarkers
    .map(b => BIOMARKER_SEARCH_TERMS[b] || b)
    .join(' OR ');

  const urlParams = new URLSearchParams();
  urlParams.set('query.cond', conditionTerm);
  urlParams.set('query.term', biomarkerTerms);

  if (options?.phase && options.phase.length > 0) {
    urlParams.set('filter.phase', options.phase.join(','));
  }
  if (options?.status && options.status.length > 0) {
    urlParams.set('filter.overallStatus', options.status.join(','));
  }
  urlParams.set('pageSize', String(options?.pageSize || 50));

  urlParams.set('fields', [
    'NCTId', 'BriefTitle', 'OverallStatus', 'Phase',
    'StartDate', 'LeadSponsorName', 'Condition', 'Keyword',
    'InterventionName', 'EnrollmentCount', 'BriefSummary',
    'CollaboratorName',
  ].join(','));

  try {
    const fullUrl = `${CT_GOV_BASE}/studies?${urlParams.toString()}`;
    const response = await proxyFetch(fullUrl);
    if (!response.ok) {
      throw new Error(`ClinicalTrials.gov API error: ${response.status}`);
    }
    const json = await response.json();
    return {
      studies: json.studies || [],
      totalCount: json.totalCount ?? json.studies?.length ?? 0,
      nextPageToken: json.nextPageToken,
    };
  } catch (err) {
    console.warn('[CT.gov API] searchBiomarkerTrials failed:', err);
    return { studies: [], totalCount: 0 };
  }
}

// Get trial counts for sponsor intelligence
export async function getTrialCountsByCondition(
  condition: string,
  biomarker?: string,
): Promise<number> {
  const conditionTerm = CONDITION_SEARCH_MAP[condition] || condition;
  const urlParams = new URLSearchParams();
  urlParams.set('query.cond', conditionTerm);
  if (biomarker) {
    const biomarkerTerm = BIOMARKER_SEARCH_TERMS[biomarker] || biomarker;
    urlParams.set('query.term', biomarkerTerm);
  }
  urlParams.set('pageSize', '1');
  urlParams.set('countTotal', 'true');
  urlParams.set('fields', 'NCTId');

  try {
    const fullUrl = `${CT_GOV_BASE}/studies?${urlParams.toString()}`;
    const response = await proxyFetch(fullUrl);
    if (!response.ok) return 0;
    const data = await response.json();
    return data.totalCount || data.studies?.length || 0;
  } catch {
    return 0;
  }
}

// Search for sponsor's trials in oncology biomarker space
export async function searchSponsorTrials(
  sponsor: string,
  condition?: string,
  options?: {
    phase?: string[];
    status?: string[];
    pageSize?: number;
  }
): Promise<CTSearchResponse> {
  const urlParams = new URLSearchParams();
  urlParams.set('query.spons', sponsor);

  if (condition) {
    const conditionTerm = CONDITION_SEARCH_MAP[condition] || condition;
    urlParams.set('query.cond', conditionTerm);
  }
  if (options?.phase && options.phase.length > 0) {
    urlParams.set('filter.phase', options.phase.join(','));
  }
  if (options?.status && options.status.length > 0) {
    urlParams.set('filter.overallStatus', options.status.join(','));
  }
  urlParams.set('pageSize', String(options?.pageSize || 50));

  urlParams.set('fields', [
    'NCTId', 'BriefTitle', 'OverallStatus', 'Phase',
    'StartDate', 'CompletionDate', 'LeadSponsorName',
    'Condition', 'Keyword', 'InterventionName', 'EnrollmentCount',
    'BriefSummary',
  ].join(','));

  try {
    const fullUrl = `${CT_GOV_BASE}/studies?${urlParams.toString()}`;
    const response = await proxyFetch(fullUrl);
    if (!response.ok) {
      throw new Error(`ClinicalTrials.gov API error: ${response.status}`);
    }
    const json = await response.json();
    return {
      studies: json.studies || [],
      totalCount: json.totalCount ?? json.studies?.length ?? 0,
      nextPageToken: json.nextPageToken,
    };
  } catch (err) {
    console.warn('[CT.gov API] searchSponsorTrials failed:', err);
    return { studies: [], totalCount: 0 };
  }
}

// Utility: extract year from CT.gov date
export function extractYear(dateStr?: string): number | undefined {
  if (!dateStr) return undefined;
  const match = dateStr.match(/(\d{4})/);
  return match ? parseInt(match[1]) : undefined;
}

// Utility: map CT.gov phase to display
export function mapPhase(phases?: string[]): string {
  if (!phases || phases.length === 0) return 'N/A';
  const phaseMap: Record<string, string> = {
    'EARLY_PHASE1': 'Phase 1',
    'PHASE1': 'Phase 1',
    'PHASE2': 'Phase 2',
    'PHASE3': 'Phase 3',
    'PHASE4': 'Phase 4',
    'NA': 'N/A',
  };
  return phases.map(p => phaseMap[p] || p).join('/');
}

// Utility: map status
export function mapStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'RECRUITING': 'Recruiting',
    'ACTIVE_NOT_RECRUITING': 'Active',
    'COMPLETED': 'Completed',
    'NOT_YET_RECRUITING': 'Not Yet Recruiting',
    'TERMINATED': 'Terminated',
    'WITHDRAWN': 'Withdrawn',
    'SUSPENDED': 'Suspended',
  };
  return statusMap[status] || status;
}

export { CONDITION_SEARCH_MAP, BIOMARKER_SEARCH_TERMS };
