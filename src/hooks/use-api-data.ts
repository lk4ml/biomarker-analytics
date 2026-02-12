// Custom hooks for fetching live data from APIs with caching and fallback

import { useState, useEffect, useRef } from 'react';
import {
  searchTrials,
  searchSponsorTrials,
  mapPhase,
  mapStatus,
  extractYear,
} from '../services/clinicaltrials';
import type { CTStudy, CTSearchResponse } from '../services/clinicaltrials';
import { getBiomarkerDiseaseAssociations } from '../services/opentargets';
import type { OTAssociation } from '../services/opentargets';
import { getGWASForIndication } from '../services/gwas';
import type { GWASSearchResult } from '../services/gwas';
import type { TrialBiomarkerUsage } from '../types';

// In-memory cache
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data as T;
  }
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// === ClinicalTrials.gov Hook ===
export interface LiveTrialData {
  trials: TrialBiomarkerUsage[];    // One entry per biomarker usage (may have same NCT ID multiple times)
  totalCount: number;                // Unique trial count (deduplicated by NCT ID)
  totalOnCtGov: number;              // Sum of API totalCounts across all biomarker queries (for display only)
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

function mapCTStudyToTrial(study: CTStudy, biomarkerHint?: string): TrialBiomarkerUsage {
  const proto = study.protocolSection;
  const id = proto.identificationModule;
  const status = proto.statusModule;
  const design = proto.designModule;
  const sponsor = proto.sponsorCollaboratorsModule;
  const summary = proto.descriptionModule?.briefSummary || '';
  const title = id.briefTitle || id.officialTitle || '';

  // Build comprehensive text for NLP — include eligibility criteria and interventions
  const eligibility = proto.eligibilityModule?.eligibilityCriteria || '';
  const interventions = (proto.armsInterventionsModule?.interventions || [])
    .map(i => `${i.name} ${i.description || ''}`).join(' ');
  const keywords = proto.conditionsModule?.keywords?.join(' ') || '';
  const fullText = `${title} ${summary} ${eligibility} ${interventions} ${keywords}`;

  // Detect biomarker from all available text (title, summary, eligibility, interventions)
  const detectedBiomarker = biomarkerHint || detectBiomarker(fullText);

  // Detect setting from title + summary
  const setting = detectSetting(title + ' ' + summary);

  // Detect tumor type from conditions + title
  const conditions = proto.conditionsModule?.conditions || [];
  const tumorType = detectTumorType(conditions.join(' ') + ' ' + title);

  // Detect cutoff from eligibility criteria + summary (where cutoffs are typically stated)
  const cutoffInfo = detectCutoff(eligibility + ' ' + summary + ' ' + title, detectedBiomarker);

  // Detect assay from eligibility + summary + interventions
  const assayText = `${eligibility} ${summary} ${title} ${interventions}`;

  // Check if trial mentions companion diagnostic
  const cdxKeywords = ['companion diagnostic', 'cdx', 'fda-approved test', 'fda approved assay'];
  const hasCdx = cdxKeywords.some(kw => fullText.toLowerCase().includes(kw));

  return {
    nctId: id.nctId,
    trialTitle: title,
    biomarkerName: detectedBiomarker,
    setting,
    tumorType,
    phase: mapPhase(design?.phases),
    cutoffValue: cutoffInfo.value,
    cutoffUnit: cutoffInfo.unit,
    cutoffOperator: cutoffInfo.operator as TrialBiomarkerUsage['cutoffOperator'],
    assayName: detectAssay(assayText, detectedBiomarker),
    assayManufacturer: 'Various',
    companionDiagnostic: hasCdx,
    sponsor: sponsor?.leadSponsor?.name || 'Unknown',
    status: mapStatus(status.overallStatus),
    startYear: extractYear(status.startDateStruct?.date) || new Date().getFullYear(),
    endYear: extractYear(status.completionDateStruct?.date),
  };
}

function detectBiomarker(text: string): string {
  const textLower = text.toLowerCase();
  const markers: Array<[string, string[]]> = [
    ['PD-L1', ['pd-l1', 'pdl1', 'cd274', 'pembrolizumab', 'nivolumab', 'atezolizumab', 'durvalumab']],
    ['HER2', ['her2', 'erbb2', 'trastuzumab', 'her2-low', 'her2-ultralow', 't-dxd']],
    ['EGFR', ['egfr', 'osimertinib', 'erlotinib', 'gefitinib', 'exon 19', 'l858r', 'exon20']],
    ['KRAS', ['kras', 'sotorasib', 'adagrasib', 'g12c', 'g12d']],
    ['BRAF', ['braf', 'v600e', 'v600k', 'vemurafenib', 'dabrafenib', 'encorafenib']],
    ['ALK', ['alk fusion', 'alk rearrangement', 'alectinib', 'lorlatinib', 'crizotinib', 'eml4-alk']],
    ['BRCA1/2', ['brca', 'brca1', 'brca2', 'olaparib', 'rucaparib', 'niraparib', 'parp']],
    ['MSI', ['msi-h', 'msi', 'dmmr', 'mmr', 'microsatellite', 'mismatch repair']],
    ['TMB', ['tmb', 'tumor mutational burden', 'mutational load']],
    ['NTRK', ['ntrk', 'trk fusion', 'larotrectinib', 'entrectinib']],
    ['ctDNA', ['ctdna', 'cell-free dna', 'cfdna', 'liquid biopsy', 'mrd', 'minimal residual']],
    ['TILs', ['tumor infiltrating lymphocytes', 'tils', 'til therapy']],
    ['PIK3CA', ['pik3ca', 'pi3k', 'alpelisib', 'pi3k inhibitor']],
    ['Ki-67', ['ki-67', 'ki67', 'mib-1', 'proliferation index']],
    ['ER', ['estrogen receptor', 'er-positive', 'er+', 'esr1', 'er positive']],
    ['PR', ['progesterone receptor', 'pr-positive', 'pr+', 'pgr', 'pr positive']],
  ];

  for (const [name, keywords] of markers) {
    if (keywords.some(kw => textLower.includes(kw))) {
      return name;
    }
  }
  return 'Unknown';
}

function detectTumorType(text: string): string {
  const textLower = text.toLowerCase();
  const types: Array<[string, string[]]> = [
    ['NSCLC', ['nsclc', 'non-small cell lung', 'non small cell lung']],
    ['Breast Cancer', ['breast cancer', 'breast carcinoma', 'tnbc', 'triple negative breast']],
    ['Melanoma', ['melanoma']],
    ['Colorectal Cancer', ['colorectal', 'colon cancer', 'rectal cancer', 'crc']],
    ['Urothelial Carcinoma', ['urothelial', 'bladder cancer']],
    ['Head & Neck SCC', ['head and neck', 'hnscc', 'squamous cell carcinoma of head']],
    ['Gastric Cancer', ['gastric', 'stomach cancer']],
    ['Hepatocellular Carcinoma', ['hepatocellular', 'hcc', 'liver cancer']],
    ['Renal Cell Carcinoma', ['renal cell', 'kidney cancer']],
    ['Ovarian Cancer', ['ovarian']],
    ['Endometrial Cancer', ['endometrial', 'uterine cancer']],
    ['Prostate Cancer', ['prostate']],
    ['Pancreatic Cancer', ['pancreatic']],
    ['Cervical Cancer', ['cervical cancer']],
  ];

  for (const [name, keywords] of types) {
    if (keywords.some(kw => textLower.includes(kw))) return name;
  }
  return 'Solid Tumor';
}

function detectSetting(text: string): TrialBiomarkerUsage['setting'] {
  const textLower = text.toLowerCase();
  if (textLower.includes('neoadjuvant') || textLower.includes('neo-adjuvant')) return 'Neoadjuvant';
  if (textLower.includes('adjuvant') && !textLower.includes('neoadjuvant')) return 'Adjuvant';
  if (textLower.includes('maintenance')) return 'Maintenance';
  if (textLower.includes('first-line') || textLower.includes('first line') || textLower.includes('1l ') || textLower.includes('frontline')) return '1L';
  if (textLower.includes('second-line') || textLower.includes('second line') || textLower.includes('2l ')) return '2L';
  if (textLower.includes('third-line') || textLower.includes('third line') || textLower.includes('3l') || textLower.includes('pre-treated') || textLower.includes('pretreated')) return '3L+';
  if (textLower.includes('monotherapy')) return 'Monotherapy';
  if (textLower.includes('combination') || textLower.includes('+')) return 'Combination';
  return '1L';
}

function detectCutoff(text: string, biomarker: string): { value: string; unit: string; operator: string } {
  const textLower = text.toLowerCase();

  if (biomarker === 'PD-L1') {
    if (textLower.includes('tps≥50') || textLower.includes('tps ≥50') || textLower.includes('tps >= 50')) return { value: '50', unit: '% TPS', operator: '>=' };
    if (textLower.includes('cps≥10') || textLower.includes('cps ≥10') || textLower.includes('cps >= 10')) return { value: '10', unit: 'CPS', operator: '>=' };
    if (textLower.includes('tps≥1') || textLower.includes('tps ≥1') || textLower.includes('tps >= 1')) return { value: '1', unit: '% TPS', operator: '>=' };
    if (textLower.includes('cps≥1') || textLower.includes('cps ≥1')) return { value: '1', unit: 'CPS', operator: '>=' };
    return { value: 'assessed', unit: 'PD-L1', operator: '>=' };
  }
  if (biomarker === 'TMB') {
    if (textLower.includes('≥10') || textLower.includes('>= 10')) return { value: '10', unit: 'mut/Mb', operator: '>=' };
    return { value: '10', unit: 'mut/Mb', operator: '>=' };
  }
  if (biomarker === 'HER2') {
    if (textLower.includes('her2-ultralow') || textLower.includes('her2 ultralow')) return { value: 'ultralow', unit: 'IHC', operator: '>=' };
    if (textLower.includes('her2-low') || textLower.includes('her2 low')) return { value: 'low (1+/2+)', unit: 'IHC', operator: '>=' };
    return { value: 'positive', unit: 'IHC', operator: 'positive' };
  }
  if (biomarker === 'MSI') return { value: 'MSI-H/dMMR', unit: 'status', operator: 'positive' };
  if (biomarker === 'KRAS') {
    if (textLower.includes('g12c')) return { value: 'G12C', unit: 'mutation', operator: 'positive' };
    if (textLower.includes('g12d')) return { value: 'G12D', unit: 'mutation', operator: 'positive' };
    return { value: 'mutated', unit: 'mutation', operator: 'positive' };
  }
  if (biomarker === 'BRAF') return { value: 'V600', unit: 'mutation', operator: 'positive' };
  if (biomarker === 'EGFR') return { value: 'mutated', unit: 'mutation', operator: 'positive' };
  if (biomarker === 'ALK') return { value: 'rearrangement', unit: 'fusion', operator: 'positive' };
  if (biomarker === 'BRCA1/2') return { value: 'pathogenic', unit: 'mutation', operator: 'positive' };
  if (biomarker === 'NTRK') return { value: 'fusion', unit: 'fusion', operator: 'positive' };
  if (biomarker === 'ctDNA') return { value: 'detectable', unit: 'detection', operator: 'positive' };
  if (biomarker === 'TILs') return { value: 'present', unit: 'presence', operator: 'positive' };
  if (biomarker === 'ER') return { value: 'positive', unit: 'IHC', operator: 'positive' };
  if (biomarker === 'PR') return { value: 'positive', unit: 'IHC', operator: 'positive' };
  if (biomarker === 'PIK3CA') return { value: 'mutated', unit: 'mutation', operator: 'positive' };
  if (biomarker === 'Ki-67') {
    if (textLower.includes('≥20') || textLower.includes('>= 20') || textLower.includes('ki-67 high')) return { value: '20', unit: '%', operator: '>=' };
    if (textLower.includes('≥14') || textLower.includes('>= 14')) return { value: '14', unit: '%', operator: '>=' };
    return { value: 'assessed', unit: '%', operator: '>=' };
  }

  return { value: 'assessed', unit: 'various', operator: '>=' };
}

function detectAssay(text: string, biomarker: string): string {
  const textLower = text.toLowerCase();
  if (textLower.includes('22c3')) return '22C3 pharmDx';
  if (textLower.includes('sp142')) return 'SP142';
  if (textLower.includes('sp263')) return 'SP263';
  if (textLower.includes('28-8')) return '28-8 pharmDx';
  if (textLower.includes('foundationone') && textLower.includes('liquid')) return 'FoundationOne Liquid CDx';
  if (textLower.includes('foundationone')) return 'FoundationOne CDx';
  if (textLower.includes('signatera')) return 'Signatera';
  if (textLower.includes('guardant')) return 'Guardant360 CDx';
  if (textLower.includes('herceptest')) return 'HercepTest';
  if (textLower.includes('cobas') && textLower.includes('egfr')) return 'cobas EGFR Mutation Test v2';
  if (textLower.includes('therascreen')) return 'therascreen KRAS RGQ PCR';

  // Default by biomarker
  const defaults: Record<string, string> = {
    'PD-L1': 'PD-L1 IHC',
    'TMB': 'NGS Panel',
    'MSI': 'MSI PCR/IHC',
    'HER2': 'HER2 IHC/FISH',
    'EGFR': 'EGFR PCR/NGS',
    'ALK': 'ALK IHC/FISH',
    'BRCA1/2': 'BRCA Sequencing',
    'KRAS': 'KRAS PCR/NGS',
    'BRAF': 'BRAF PCR/NGS',
    'NTRK': 'NGS/FISH',
    'ctDNA': 'ctDNA NGS',
    'TILs': 'H&E / IHC',
    'ER': 'ER IHC',
    'PR': 'PR IHC',
    'PIK3CA': 'PIK3CA PCR/NGS',
    'Ki-67': 'Ki-67 IHC',
  };
  return defaults[biomarker] || 'Various';
}

// Main hook: fetch live trials from ClinicalTrials.gov
export function useLiveTrials(
  condition: string | null,
  biomarkers: string[],
  options?: {
    phase?: string[];
    status?: string[];
    pageSize?: number;
    enabled?: boolean;
  }
): LiveTrialData {
  const [data, setData] = useState<LiveTrialData>({
    trials: [],
    totalCount: 0,
    totalOnCtGov: 0,
    loading: false,
    error: null,
    lastUpdated: null,
  });

  // Serialize inputs to stable strings for dependency tracking
  const biomarkersKey = biomarkers.join(',');
  const statusKey = options?.status?.join(',') || '';
  const phaseKey = options?.phase?.join(',') || '';
  const pageSize = options?.pageSize || 15;
  const enabled = options?.enabled !== false;

  // Track in-flight requests to prevent duplicates
  const fetchingRef = useRef(false);
  const prevKeyRef = useRef<string>('');

  useEffect(() => {
    if (!condition || !biomarkersKey || !enabled) {
      // Reset data when disabled
      setData(prev => prev.trials.length === 0 ? prev : {
        trials: [],
        totalCount: 0,
        totalOnCtGov: 0,
        loading: false,
        error: null,
        lastUpdated: null,
      });
      return;
    }

    const cacheKey = `trials:${condition}:${biomarkersKey}:${phaseKey}:${statusKey}`;

    // Don't re-fetch for the same key
    if (cacheKey === prevKeyRef.current) return;
    prevKeyRef.current = cacheKey;

    const cached = getCached<LiveTrialData>(cacheKey);
    if (cached) {
      setData(cached);
      return;
    }

    if (fetchingRef.current) return;
    fetchingRef.current = true;

    let cancelled = false;
    setData(prev => ({ ...prev, loading: true, error: null }));

    const biomarkerList = biomarkersKey.split(',').filter(Boolean);
    const statusList = statusKey ? statusKey.split(',') : ['RECRUITING', 'ACTIVE_NOT_RECRUITING', 'COMPLETED'];
    const phaseList = phaseKey ? phaseKey.split(',') : ['PHASE1', 'PHASE2', 'PHASE3'];

    // Fetch trials for each biomarker in parallel (up to 10 biomarkers)
    // Filter: last 10 years, interventional studies only
    const promises = biomarkerList.slice(0, 10).map(bm =>
      searchTrials({
        condition,
        biomarker: bm,
        phase: phaseList,
        status: statusList,
        pageSize,
        startDateFrom: '2016-01-01',
        studyType: 'INTERVENTIONAL',
      }).then(res => ({
        biomarker: bm,
        studies: res.studies,
        total: res.totalCount,
      }))
    );

    Promise.allSettled(promises)
      .then(results => {
        if (cancelled) return;

        const allTrials: TrialBiomarkerUsage[] = [];
        let apiTotalSum = 0;                            // Sum of API totals (for "on CT.gov" display)
        const uniqueNCTIds = new Set<string>();          // Truly unique trials
        const seenNCTIdBiomarker = new Set<string>();    // Dedup for table rows (nctId+biomarker)

        for (const result of results) {
          if (result.status === 'fulfilled') {
            apiTotalSum += result.value.total;
            for (const study of result.value.studies) {
              try {
                const nctId = study.protocolSection.identificationModule.nctId;
                uniqueNCTIds.add(nctId);
                const dedupKey = nctId + result.value.biomarker;
                if (!seenNCTIdBiomarker.has(dedupKey)) {
                  seenNCTIdBiomarker.add(dedupKey);
                  allTrials.push(mapCTStudyToTrial(study, result.value.biomarker));
                }
              } catch {
                // Skip malformed studies
              }
            }
          }
        }

        const newData: LiveTrialData = {
          trials: allTrials,
          totalCount: uniqueNCTIds.size,    // Unique trial count from fetched results
          totalOnCtGov: apiTotalSum,         // Sum of API counts (may overlap, for display only)
          loading: false,
          error: null,
          lastUpdated: new Date(),
        };

        setCache(cacheKey, newData);
        setData(newData);
      })
      .catch(err => {
        if (cancelled) return;
        setData(prev => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch trials',
        }));
      })
      .finally(() => {
        fetchingRef.current = false;
      });

    return () => {
      cancelled = true;
      fetchingRef.current = false;
    };
  }, [condition, biomarkersKey, statusKey, phaseKey, pageSize, enabled]);

  return data;
}

// Hook for sponsor intelligence
export interface SponsorData {
  sponsors: Array<{
    name: string;
    trialCount: number;
    phases: Record<string, number>;
    biomarkers: Record<string, number>;
    indications: Record<string, number>;
    status: Record<string, number>;
  }>;
  loading: boolean;
  error: string | null;
}

export function useSponsorIntelligence(
  condition: string | null,
  enabled: boolean = true
): SponsorData {
  const [data, setData] = useState<SponsorData>({
    sponsors: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!condition || !enabled) return;

    const cacheKey = `sponsors:${condition}`;
    const cached = getCached<SponsorData>(cacheKey);
    if (cached) {
      setData(cached);
      return;
    }

    setData(prev => ({ ...prev, loading: true }));

    searchTrials({
      condition,
      status: ['RECRUITING', 'ACTIVE_NOT_RECRUITING', 'COMPLETED'],
      pageSize: 100,
    }).then(response => {
      const sponsorMap = new Map<string, {
        name: string;
        trialCount: number;
        phases: Record<string, number>;
        biomarkers: Record<string, number>;
        indications: Record<string, number>;
        status: Record<string, number>;
      }>();

      for (const study of response.studies) {
        const proto = study.protocolSection;
        const sponsorName = proto.sponsorCollaboratorsModule?.leadSponsor?.name || 'Unknown';
        const phase = mapPhase(proto.designModule?.phases);
        const statusStr = mapStatus(proto.statusModule.overallStatus);
        const title = proto.identificationModule.briefTitle || '';
        const biomarker = detectBiomarker(title + ' ' + (proto.descriptionModule?.briefSummary || ''));
        const tumorType = detectTumorType(
          (proto.conditionsModule?.conditions || []).join(' ') + ' ' + title
        );

        if (!sponsorMap.has(sponsorName)) {
          sponsorMap.set(sponsorName, {
            name: sponsorName,
            trialCount: 0,
            phases: {},
            biomarkers: {},
            indications: {},
            status: {},
          });
        }

        const entry = sponsorMap.get(sponsorName)!;
        entry.trialCount++;
        entry.phases[phase] = (entry.phases[phase] || 0) + 1;
        if (biomarker !== 'Unknown') {
          entry.biomarkers[biomarker] = (entry.biomarkers[biomarker] || 0) + 1;
        }
        entry.indications[tumorType] = (entry.indications[tumorType] || 0) + 1;
        entry.status[statusStr] = (entry.status[statusStr] || 0) + 1;
      }

      const sponsors = Array.from(sponsorMap.values())
        .sort((a, b) => b.trialCount - a.trialCount)
        .slice(0, 20);

      const newData: SponsorData = { sponsors, loading: false, error: null };
      setCache(cacheKey, newData);
      setData(newData);
    }).catch(err => {
      setData(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch sponsor data',
      }));
    });
  }, [condition, enabled]);

  return data;
}

// Hook for Open Targets data
export interface OpenTargetsData {
  associations: OTAssociation[];
  loading: boolean;
  error: string | null;
}

export function useOpenTargets(
  indication: string | null,
  biomarkers: string[],
  enabled: boolean = true
): OpenTargetsData {
  const [data, setData] = useState<OpenTargetsData>({
    associations: [],
    loading: false,
    error: null,
  });

  const biomarkersKey = biomarkers.join(',');

  useEffect(() => {
    if (!indication || !biomarkersKey || !enabled) return;

    const cacheKey = `ot:${indication}:${biomarkersKey}`;
    const cached = getCached<OpenTargetsData>(cacheKey);
    if (cached) {
      setData(cached);
      return;
    }

    let cancelled = false;
    setData(prev => ({ ...prev, loading: true }));

    const biomarkerList = biomarkersKey.split(',').filter(Boolean);
    getBiomarkerDiseaseAssociations(indication, biomarkerList)
      .then(associations => {
        if (cancelled) return;
        const newData: OpenTargetsData = { associations, loading: false, error: null };
        setCache(cacheKey, newData);
        setData(newData);
      })
      .catch(err => {
        if (cancelled) return;
        setData(prev => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch Open Targets data',
        }));
      });

    return () => { cancelled = true; };
  }, [indication, biomarkersKey, enabled]);

  return data;
}

// Hook for GWAS data
export interface GWASData {
  associations: GWASSearchResult[];
  loading: boolean;
  error: string | null;
}

export function useGWAS(
  indication: string | null,
  biomarkers: string[],
  enabled: boolean = true
): GWASData {
  const [data, setData] = useState<GWASData>({
    associations: [],
    loading: false,
    error: null,
  });

  const biomarkersKey = biomarkers.join(',');

  useEffect(() => {
    if (!indication || !biomarkersKey || !enabled) return;

    const cacheKey = `gwas:${indication}:${biomarkersKey}`;
    const cached = getCached<GWASData>(cacheKey);
    if (cached) {
      setData(cached);
      return;
    }

    let cancelled = false;
    setData(prev => ({ ...prev, loading: true }));

    const biomarkerList = biomarkersKey.split(',').filter(Boolean);
    getGWASForIndication(indication, biomarkerList)
      .then(associations => {
        if (cancelled) return;
        const newData: GWASData = { associations, loading: false, error: null };
        setCache(cacheKey, newData);
        setData(newData);
      })
      .catch(err => {
        if (cancelled) return;
        setData(prev => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to fetch GWAS data',
        }));
      });

    return () => { cancelled = true; };
  }, [indication, biomarkersKey, enabled]);

  return data;
}

// Hook for full live search
export function useLiveSearch(query: string, enabled: boolean = true) {
  const [results, setResults] = useState<{ studies: CTStudy[]; total: number }>({ studies: [], total: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || !enabled) return;

    const cacheKey = `search:${query}`;
    const cached = getCached<CTSearchResponse>(cacheKey);
    if (cached) {
      setResults({ studies: cached.studies, total: cached.totalCount });
      return;
    }

    setLoading(true);
    searchTrials({
      condition: query,
      pageSize: 20,
    }).then(res => {
      setCache(cacheKey, res);
      setResults({ studies: res.studies, total: res.totalCount });
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [query, enabled]);

  return { results, loading };
}

export { searchSponsorTrials };
