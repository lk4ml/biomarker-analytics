/**
 * Backend data hooks - replaces static imports + client-side CT.gov calls
 * with server-side API calls to our FastAPI backend.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  getIndications,
  getIndicationsSummary,
  getDashboardStats,
  getTrialBiomarkers,
  getBiomarkers,
  getAssays,
  getCutoffTrends,
  getOpenTargets,
  getGWAS,
  getPubMed,
} from '../services/api-client';
import type { DashboardStats, PaginatedTrialBiomarkers, IndicationItem, IndicationSummary } from '../services/api-client';
import type {
  TrialBiomarkerUsage,
  Biomarker,
  AssayInfo,
  CutoffTrend,
  GWASAssociation,
  OpenTargetLink,
  NewsUpdate,
} from '../types';

// Simple in-memory cache to avoid refetching on tab switches
const cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 5 * 60 * 1000; // 5 min

function getCached<T>(key: string): T | null {
  const e = cache.get(key);
  if (e && Date.now() - e.ts < TTL) return e.data as T;
  return null;
}
function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

// ===== Indications hook =====
export function useIndications() {
  const [indications, setIndications] = useState<IndicationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = getCached<IndicationItem[]>('indications');
    if (cached) { setIndications(cached); setLoading(false); return; }

    getIndications()
      .then(data => { setIndications(data); setCache('indications', data); })
      .catch(err => console.error('Failed to load indications:', err))
      .finally(() => setLoading(false));
  }, []);

  return { indications, loading };
}

// ===== Indications summary hook (with stats) =====
export function useIndicationsSummary() {
  const [summaries, setSummaries] = useState<IndicationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = getCached<IndicationSummary[]>('indications_summary');
    if (cached) { setSummaries(cached); setLoading(false); return; }

    getIndicationsSummary()
      .then(data => { setSummaries(data); setCache('indications_summary', data); })
      .catch(err => console.error('Failed to load indication summaries:', err))
      .finally(() => setLoading(false));
  }, []);

  return { summaries, loading };
}

// ===== Main data hook for a selected indication =====
export interface BackendData {
  // Trial data
  trials: TrialBiomarkerUsage[];
  totalTrials: number;
  loading: boolean;
  error: string | null;

  // Dashboard stats (computed server-side)
  dashboardStats: DashboardStats | null;
  dashboardLoading: boolean;

  // Reference data
  biomarkers: Biomarker[];
  assays: AssayInfo[];
  cutoffTrends: CutoffTrend[];

  // External data
  gwasAssociations: GWASAssociation[];
  openTargetLinks: OpenTargetLink[];
  pubmedArticles: { pmid: string; title: string; abstract: string | null; authors: string[]; journal: string | null; pubDate: string | null; biomarkerMentions: string[] }[];

  // Pagination
  page: number;
  totalPages: number;
  setPage: (p: number) => void;

  // Trial filter passthrough
  fetchTrials: (params: {
    biomarker?: string;
    phase?: string;
    setting?: string;
    search?: string;
    pageSize?: number;
  }) => void;
}

export function useBackendData(selectedIndication: string): BackendData {
  // Trial data
  const [trials, setTrials] = useState<TrialBiomarkerUsage[]>([]);
  const [totalTrials, setTotalTrials] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Dashboard
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  // Reference
  const [biomarkers, setBiomarkers] = useState<Biomarker[]>([]);
  const [assays, setAssays] = useState<AssayInfo[]>([]);
  const [cutoffTrends, setCutoffTrends] = useState<CutoffTrend[]>([]);

  // External
  const [gwasAssociations, setGwasAssociations] = useState<GWASAssociation[]>([]);
  const [openTargetLinks, setOpenTargetLinks] = useState<OpenTargetLink[]>([]);
  const [pubmedArticles, setPubmedArticles] = useState<BackendData['pubmedArticles']>([]);

  // Track current filter params for refetching
  const [filterParams, setFilterParams] = useState<{
    biomarker?: string;
    phase?: string;
    setting?: string;
    search?: string;
    pageSize?: number;
  }>({});

  const indication = selectedIndication === 'all' ? 'All' : selectedIndication;

  // Fetch trials (paginated, filtered)
  const fetchTrials = useCallback((params: typeof filterParams = {}) => {
    setFilterParams(params);
    setLoading(true);
    setError(null);

    const cacheKey = `trials:${indication}:${JSON.stringify(params)}:${page}`;
    const cached = getCached<PaginatedTrialBiomarkers>(cacheKey);
    if (cached) {
      setTrials(cached.items);
      setTotalTrials(cached.total);
      setTotalPages(cached.totalPages);
      setLoading(false);
      return;
    }

    getTrialBiomarkers({
      indication: indication !== 'All' ? indication : undefined,
      biomarker: params.biomarker,
      phase: params.phase,
      setting: params.setting,
      search: params.search,
      page: String(page),
      pageSize: String(params.pageSize || 200),
    })
      .then(data => {
        setTrials(data.items);
        setTotalTrials(data.total);
        setTotalPages(data.totalPages);
        setCache(cacheKey, data);
      })
      .catch(err => {
        console.error('Failed to fetch trials:', err);
        setError(err.message || 'Failed to fetch trials');
      })
      .finally(() => setLoading(false));
  }, [indication, page]);

  // Fetch dashboard stats
  useEffect(() => {
    if (indication === 'All') {
      // Fetch global stats
      setDashboardLoading(true);
      const ckey = 'dashboard:All';
      const cached = getCached<DashboardStats>(ckey);
      if (cached) { setDashboardStats(cached); setDashboardLoading(false); return; }

      getDashboardStats('All')
        .then(d => { setDashboardStats(d); setCache(ckey, d); })
        .catch(err => console.error('Dashboard error:', err))
        .finally(() => setDashboardLoading(false));
    } else {
      setDashboardLoading(true);
      const ckey = `dashboard:${indication}`;
      const cached = getCached<DashboardStats>(ckey);
      if (cached) { setDashboardStats(cached); setDashboardLoading(false); return; }

      getDashboardStats(indication)
        .then(d => { setDashboardStats(d); setCache(ckey, d); })
        .catch(err => console.error('Dashboard error:', err))
        .finally(() => setDashboardLoading(false));
    }
  }, [indication]);

  // Fetch trials when indication or page changes
  useEffect(() => {
    fetchTrials(filterParams);
  }, [indication, page, fetchTrials]);

  // Fetch reference data
  useEffect(() => {
    const bcache = getCached<Biomarker[]>('biomarkers');
    if (bcache) { setBiomarkers(bcache); }
    else {
      getBiomarkers()
        .then(d => { setBiomarkers(d); setCache('biomarkers', d); })
        .catch(err => console.error('Biomarkers error:', err));
    }

    const acache = getCached<AssayInfo[]>('assays');
    if (acache) { setAssays(acache); }
    else {
      getAssays()
        .then(d => { setAssays(d); setCache('assays', d); })
        .catch(err => console.error('Assays error:', err));
    }
  }, []);

  // Fetch cutoff trends per indication
  useEffect(() => {
    const ckey = `cutoffs:${indication}`;
    const cached = getCached<CutoffTrend[]>(ckey);
    if (cached) { setCutoffTrends(cached); return; }

    getCutoffTrends(undefined, indication !== 'All' ? indication : undefined)
      .then(d => { setCutoffTrends(d); setCache(ckey, d); })
      .catch(err => console.error('Cutoff trends error:', err));
  }, [indication]);

  // Fetch external data per indication
  useEffect(() => {
    if (indication === 'All') {
      setGwasAssociations([]);
      setOpenTargetLinks([]);
      setPubmedArticles([]);
      return;
    }

    // GWAS
    const gkey = `gwas:${indication}`;
    const gcached = getCached<GWASAssociation[]>(gkey);
    if (gcached) { setGwasAssociations(gcached); }
    else {
      getGWAS(indication)
        .then(d => { setGwasAssociations(d); setCache(gkey, d); })
        .catch(err => console.error('GWAS error:', err));
    }

    // Open Targets
    const otkey = `ot:${indication}`;
    const otcached = getCached<OpenTargetLink[]>(otkey);
    if (otcached) { setOpenTargetLinks(otcached); }
    else {
      getOpenTargets(indication)
        .then(d => { setOpenTargetLinks(d); setCache(otkey, d); })
        .catch(err => console.error('Open Targets error:', err));
    }

    // PubMed
    const pmkey = `pubmed:${indication}`;
    const pmcached = getCached<BackendData['pubmedArticles']>(pmkey);
    if (pmcached) { setPubmedArticles(pmcached); }
    else {
      getPubMed(indication)
        .then(d => { setPubmedArticles(d); setCache(pmkey, d); })
        .catch(err => console.error('PubMed error:', err));
    }
  }, [indication]);

  return {
    trials,
    totalTrials,
    loading,
    error,
    dashboardStats,
    dashboardLoading,
    biomarkers,
    assays,
    cutoffTrends,
    gwasAssociations,
    openTargetLinks,
    pubmedArticles,
    page,
    totalPages,
    setPage,
    fetchTrials,
  };
}
