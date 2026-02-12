// Biomarker types
export interface Biomarker {
  id: string;
  name: string;
  aliases: string[];
  category: BiomarkerCategory;
  description: string;
  geneSymbol?: string;
  uniprotId?: string;
}

export type BiomarkerCategory = 
  | 'Predictive'
  | 'Prognostic'
  | 'Diagnostic'
  | 'Pharmacodynamic'
  | 'Safety'
  | 'Monitoring';

export interface TrialBiomarkerUsage {
  nctId: string;
  trialTitle: string;
  biomarkerName: string;
  setting: TherapeuticSetting;
  tumorType: string;
  phase: string;
  cutoffValue: string;
  cutoffUnit: string;
  cutoffOperator: '>=' | '>' | '<=' | '<' | '=' | 'positive' | 'negative' | 'high' | 'low';
  assayName: string;
  assayManufacturer: string;
  companionDiagnostic: boolean;
  sponsor: string;
  status: string;
  startYear: number;
  endYear?: number;
}

export type TherapeuticSetting = 
  | '1L' | '2L' | '3L+' 
  | 'Neoadjuvant' | 'Adjuvant' 
  | 'Maintenance' | 'Monotherapy' | 'Combination';

export interface CutoffTrend {
  biomarkerName: string;
  tumorType: string;
  year: number;
  cutoffValue: number;
  cutoffUnit: string;
  trialCount: number;
  assay: string;
}

export interface AssayInfo {
  name: string;
  manufacturer: string;
  platform: string;
  antibodyClone?: string;
  fdaApproved: boolean;
  companionDiagnosticFor: string[];
  biomarkers: string[];
}

export interface GWASAssociation {
  rsId: string;
  gene: string;
  traitName: string;
  pValue: number;
  oddsRatio?: number;
  riskAllele: string;
  population: string;
  pubmedId: string;
  studyTitle: string;
  biomarkerRelevance: string;
}

export interface OpenTargetLink {
  targetId: string;
  targetName: string;
  diseaseId: string;
  diseaseName: string;
  associationScore: number;
  datatypeScores: {
    literature: number;
    rna_expression: number;
    genetic_association: number;
    somatic_mutation: number;
    known_drug: number;
    animal_model: number;
    affected_pathway: number;
  };
}

export interface NewsUpdate {
  id: string;
  title: string;
  source: 'PubMed' | 'ClinicalTrials' | 'FDA' | 'ASCO' | 'ESMO';
  date: string;
  summary: string;
  url: string;
  biomarkers: string[];
  tags: string[];
}

export interface FilterState {
  biomarker: string;
  tumorType: string;
  setting: string;
  phase: string;
  assay: string;
  yearRange: [number, number];
}
