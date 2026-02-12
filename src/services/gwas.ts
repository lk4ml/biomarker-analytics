// NHGRI-EBI GWAS Catalog REST API Service
// Docs: https://www.ebi.ac.uk/gwas/rest/docs/api

const GWAS_API = 'https://www.ebi.ac.uk/gwas/rest/api';

export interface GWASStudy {
  accessionId: string;
  fullPvalueSet: boolean;
  publicationInfo: {
    pubmedId: string;
    title: string;
    author: { fullname: string };
    publication: string;
    publicationDate: string;
  };
  initialSampleSize: string;
}

export interface GWASAssociationAPI {
  riskFrequency: string;
  pvalue: number;
  orPerCopyNum?: number;
  betaNum?: number;
  range?: string;
  strongestRiskAlleles: Array<{
    riskAlleleName: string;
  }>;
  loci: Array<{
    authorReportedGenes: Array<{
      geneName: string;
    }>;
    strongestRiskAlleles: Array<{
      riskAlleleName: string;
    }>;
  }>;
  _links: {
    snps: { href: string }[];
    efoTraits: { href: string }[];
    study: { href: string };
  };
}

export interface GWASSearchResult {
  rsId: string;
  gene: string;
  traitName: string;
  pValue: number;
  oddsRatio?: number;
  riskAllele: string;
  pubmedId: string;
  studyTitle: string;
}

// Biomarker-relevant GWAS search terms
const BIOMARKER_GWAS_TERMS: Record<string, string[]> = {
  'PD-L1': ['PD-L1', 'CD274', 'immune checkpoint', 'immunotherapy response'],
  'TMB': ['tumor mutational burden', 'mutation rate', 'somatic mutation'],
  'MSI': ['microsatellite instability', 'mismatch repair', 'MLH1', 'MSH2'],
  'HER2': ['ERBB2', 'HER2', 'HER2 amplification'],
  'EGFR': ['EGFR', 'epidermal growth factor receptor'],
  'ALK': ['ALK', 'anaplastic lymphoma kinase'],
  'BRCA1/2': ['BRCA1', 'BRCA2', 'breast cancer susceptibility'],
  'KRAS': ['KRAS', 'RAS pathway'],
  'BRAF': ['BRAF', 'RAF kinase'],
  'NTRK': ['NTRK', 'neurotrophic tyrosine kinase'],
  'ctDNA': ['cell-free DNA', 'circulating DNA'],
  'TILs': ['tumor infiltrating lymphocytes', 'tumor immunity'],
};

// Disease-relevant GWAS search terms
const DISEASE_GWAS_TERMS: Record<string, string[]> = {
  'NSCLC': ['lung cancer', 'non-small cell lung', 'lung carcinoma'],
  'Breast Cancer': ['breast cancer', 'breast carcinoma'],
  'Melanoma': ['melanoma', 'skin cancer'],
  'Colorectal Cancer': ['colorectal cancer', 'colon cancer'],
  'Urothelial Carcinoma': ['bladder cancer', 'urothelial'],
  'Head & Neck SCC': ['head and neck cancer', 'oral cancer'],
  'Gastric Cancer': ['gastric cancer', 'stomach cancer'],
  'Hepatocellular Carcinoma': ['liver cancer', 'hepatocellular'],
  'Renal Cell Carcinoma': ['kidney cancer', 'renal cell'],
  'Ovarian Cancer': ['ovarian cancer'],
  'Endometrial Cancer': ['endometrial cancer', 'uterine cancer'],
  'Prostate Cancer': ['prostate cancer'],
  'Pancreatic Cancer': ['pancreatic cancer'],
  'Cervical Cancer': ['cervical cancer'],
};

// Search GWAS associations by EFO trait
export async function searchGWASByTrait(traitKeyword: string, pageSize: number = 20): Promise<GWASSearchResult[]> {
  try {
    const response = await fetch(
      `${GWAS_API}/efoTraits/search/findByQuery?query=${encodeURIComponent(traitKeyword)}&page=0&size=${pageSize}`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!response.ok) return [];

    const data = await response.json();
    const traits = data?._embedded?.efoTraits || [];

    if (traits.length === 0) return [];

    // Get associations for the first matching trait
    const traitId = traits[0]?.shortForm;
    if (!traitId) return [];

    return await getAssociationsForTrait(traitId, pageSize);
  } catch {
    return [];
  }
}

// Get associations for a specific EFO trait
async function getAssociationsForTrait(traitId: string, pageSize: number = 20): Promise<GWASSearchResult[]> {
  try {
    const response = await fetch(
      `${GWAS_API}/efoTraits/${traitId}/associations?page=0&size=${pageSize}`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!response.ok) return [];

    const data = await response.json();
    const associations = data?._embedded?.associations || [];

    return associations.map((assoc: GWASAssociationAPI) => {
      const genes = assoc.loci?.[0]?.authorReportedGenes?.map(g => g.geneName).filter(Boolean).join(', ') || 'Unknown';
      const riskAllele = assoc.strongestRiskAlleles?.[0]?.riskAlleleName || 'N/A';
      const rsId = riskAllele.split('-')[0] || riskAllele;

      return {
        rsId,
        gene: genes,
        traitName: traitId,
        pValue: assoc.pvalue,
        oddsRatio: assoc.orPerCopyNum,
        riskAllele: riskAllele.split('-')[1] || riskAllele,
        pubmedId: '',
        studyTitle: '',
      };
    }).filter((r: GWASSearchResult) => r.pValue && r.pValue < 5e-8); // Genome-wide significance
  } catch {
    return [];
  }
}

// Search GWAS by gene name (SNP associations)
export async function searchGWASByGene(geneName: string, pageSize: number = 10): Promise<GWASSearchResult[]> {
  try {
    const response = await fetch(
      `${GWAS_API}/singleNucleotidePolymorphisms/search/findByGene?geneName=${encodeURIComponent(geneName)}&page=0&size=${pageSize}`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!response.ok) return [];

    const data = await response.json();
    const snps = data?._embedded?.singleNucleotidePolymorphisms || [];

    const results: GWASSearchResult[] = [];
    for (const snp of snps.slice(0, 5)) {
      if (snp.rsId) {
        results.push({
          rsId: snp.rsId,
          gene: geneName,
          traitName: 'Various',
          pValue: 0,
          riskAllele: 'N/A',
          pubmedId: '',
          studyTitle: `SNP in ${geneName}`,
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

// Get GWAS data for biomarkers relevant to an indication
export async function getGWASForIndication(
  indication: string,
  biomarkers: string[],
): Promise<GWASSearchResult[]> {
  const diseaseTerms = DISEASE_GWAS_TERMS[indication] || [indication];
  const allResults: GWASSearchResult[] = [];

  // Search by disease terms
  const diseasePromises = diseaseTerms.slice(0, 2).map(term => searchGWASByTrait(term, 10));
  const diseaseResults = await Promise.allSettled(diseasePromises);
  for (const result of diseaseResults) {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
    }
  }

  // Search by biomarker gene names
  const geneSearches: string[] = [];
  for (const bm of biomarkers.slice(0, 5)) {
    const terms = BIOMARKER_GWAS_TERMS[bm] || [];
    geneSearches.push(...terms.slice(0, 1));
  }

  const genePromises = geneSearches.map(gene => searchGWASByGene(gene, 5));
  const geneResults = await Promise.allSettled(genePromises);
  for (const result of geneResults) {
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
    }
  }

  // Deduplicate by rsId
  const seen = new Set<string>();
  return allResults.filter(r => {
    if (seen.has(r.rsId)) return false;
    seen.add(r.rsId);
    return true;
  });
}

export { BIOMARKER_GWAS_TERMS, DISEASE_GWAS_TERMS };
