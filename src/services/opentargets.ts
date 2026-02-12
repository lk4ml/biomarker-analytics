// Open Targets Platform GraphQL API Service
// Docs: https://platform-docs.opentargets.org/data-access/graphql-api

const OPEN_TARGETS_API = 'https://api.platform.opentargets.org/api/v4/graphql';

export interface OTAssociation {
  target: {
    id: string;
    approvedSymbol: string;
    approvedName: string;
  };
  disease: {
    id: string;
    name: string;
  };
  score: number;
  datatypeScores: Array<{
    componentId: string;
    score: number;
  }>;
}

export interface OTSearchResult {
  data: OTAssociation[];
  total: number;
}

// Map gene symbols to Ensembl IDs for Open Targets
const GENE_ENSEMBL_MAP: Record<string, string> = {
  'CD274': 'ENSG00000120217',      // PD-L1
  'ERBB2': 'ENSG00000141736',      // HER2
  'EGFR': 'ENSG00000146648',       // EGFR
  'KRAS': 'ENSG00000133703',       // KRAS
  'BRAF': 'ENSG00000157764',       // BRAF
  'BRCA1': 'ENSG00000012048',      // BRCA1
  'BRCA2': 'ENSG00000139618',      // BRCA2
  'ALK': 'ENSG00000171094',        // ALK
  'NTRK1': 'ENSG00000198400',      // NTRK1
  'NTRK2': 'ENSG00000148053',      // NTRK2
  'NTRK3': 'ENSG00000140538',      // NTRK3
  'MLH1': 'ENSG00000076242',       // MSI / MLH1
  'MSH2': 'ENSG00000095002',       // MSI / MSH2
  'TP53': 'ENSG00000141510',       // TP53
  'ESR1': 'ENSG00000091831',       // Estrogen Receptor (ER)
  'PGR': 'ENSG00000082175',        // Progesterone Receptor (PR)
  'PIK3CA': 'ENSG00000121879',     // PIK3CA
  'MKI67': 'ENSG00000148773',      // Ki-67
};

// Map diseases to EFO IDs
const DISEASE_EFO_MAP: Record<string, string> = {
  'NSCLC': 'EFO_0003060',
  'Breast Cancer': 'EFO_0000305',
  'Melanoma': 'EFO_0000389',
  'Colorectal Cancer': 'EFO_0005842',
  'Urothelial Carcinoma': 'EFO_0006858',
  'Head & Neck SCC': 'EFO_0000181',
  'Gastric Cancer': 'EFO_0000178',
  'Hepatocellular Carcinoma': 'EFO_0000182',
  'Renal Cell Carcinoma': 'MONDO_0017885',
  'Ovarian Cancer': 'EFO_0001075',
  'Endometrial Cancer': 'EFO_0002916',
  'Prostate Cancer': 'EFO_0001663',
  'Pancreatic Cancer': 'EFO_0002618',
  'Cervical Cancer': 'EFO_0001061',
};

// Map biomarker names to gene symbols
const BIOMARKER_GENE_MAP: Record<string, string[]> = {
  'PD-L1': ['CD274'],
  'HER2': ['ERBB2'],
  'EGFR': ['EGFR'],
  'KRAS': ['KRAS'],
  'BRAF': ['BRAF'],
  'BRCA1/2': ['BRCA1', 'BRCA2'],
  'ALK': ['ALK'],
  'NTRK': ['NTRK1', 'NTRK2', 'NTRK3'],
  'MSI': ['MLH1', 'MSH2'],
  'TMB': ['TP53'],
  'ER': ['ESR1'],
  'PR': ['PGR'],
  'PIK3CA': ['PIK3CA'],
  'Ki-67': ['MKI67'],
};

async function graphqlQuery(query: string, variables: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(OPEN_TARGETS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`Open Targets API error: ${response.status}`);
  }
  return response.json();
}

// Get associations for a target-disease pair
export async function getTargetDiseaseAssociation(
  targetId: string,
  diseaseId: string,
): Promise<OTAssociation | null> {
  const query = `
    query TargetDiseaseAssociation($ensemblId: String!, $efoId: String!) {
      target(ensemblId: $ensemblId) {
        id
        approvedSymbol
        approvedName
      }
      disease(efoId: $efoId) {
        id
        name
        associatedTargets(page: { index: 0, size: 1 }) {
          rows {
            target {
              id
              approvedSymbol
            }
            score
            datatypeScores {
              componentId
              score
            }
          }
        }
      }
    }
  `;

  try {
    const result = await graphqlQuery(query, { ensemblId: targetId, efoId: diseaseId }) as Record<string, unknown>;
    const data = result as { data?: { target?: { id: string; approvedSymbol: string; approvedName: string }; disease?: { id: string; name: string; associatedTargets?: { rows: Array<{ target?: { id: string }; score: number; datatypeScores: Array<{ componentId: string; score: number }> }> } } } };
    if (!data.data?.target || !data.data?.disease) return null;
    const rows = data.data.disease.associatedTargets?.rows || [];
    const match = rows.find(r => r.target?.id === targetId);
    if (!match) return null;

    return {
      target: data.data.target,
      disease: { id: data.data.disease.id, name: data.data.disease.name },
      score: match.score,
      datatypeScores: match.datatypeScores,
    };
  } catch {
    return null;
  }
}

// Get all associations for a disease
export async function getDiseaseAssociations(
  diseaseId: string,
  pageSize: number = 25,
): Promise<OTAssociation[]> {
  const query = `
    query DiseaseAssociations($efoId: String!, $size: Int!) {
      disease(efoId: $efoId) {
        id
        name
        associatedTargets(page: { index: 0, size: $size }) {
          rows {
            target {
              id
              approvedSymbol
              approvedName
            }
            score
            datatypeScores {
              componentId
              score
            }
          }
        }
      }
    }
  `;

  try {
    const result = await graphqlQuery(query, { efoId: diseaseId, size: pageSize }) as {
      data?: {
        disease?: {
          id: string;
          name: string;
          associatedTargets?: {
            rows: Array<{
              target: { id: string; approvedSymbol: string; approvedName: string };
              score: number;
              datatypeScores: Array<{ componentId: string; score: number }>;
            }>;
          };
        };
      };
    };
    if (!result.data?.disease?.associatedTargets) return [];
    return result.data.disease.associatedTargets.rows.map(row => ({
      target: row.target,
      disease: { id: result.data!.disease!.id, name: result.data!.disease!.name },
      score: row.score,
      datatypeScores: row.datatypeScores,
    }));
  } catch {
    return [];
  }
}

// Get associations for specific biomarkers in a disease
export async function getBiomarkerDiseaseAssociations(
  indication: string,
  biomarkers: string[],
): Promise<OTAssociation[]> {
  const diseaseId = DISEASE_EFO_MAP[indication];
  if (!diseaseId) return [];

  const targetIds: Array<{ ensemblId: string; biomarker: string; gene: string }> = [];
  for (const bm of biomarkers) {
    const genes = BIOMARKER_GENE_MAP[bm] || [];
    for (const gene of genes) {
      const ensemblId = GENE_ENSEMBL_MAP[gene];
      if (ensemblId) {
        targetIds.push({ ensemblId, biomarker: bm, gene });
      }
    }
  }

  // Fetch all in parallel
  const results = await Promise.allSettled(
    targetIds.map(t => getTargetDiseaseAssociation(t.ensemblId, diseaseId))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<OTAssociation | null> => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value!);
}

// Utility: map componentId to readable name
export function mapDatatypeName(componentId: string): string {
  const names: Record<string, string> = {
    'literature': 'Literature',
    'rna_expression': 'RNA Expression',
    'genetic_association': 'Genetic Association',
    'somatic_mutation': 'Somatic Mutation',
    'known_drug': 'Known Drug',
    'animal_model': 'Animal Model',
    'affected_pathway': 'Affected Pathway',
  };
  return names[componentId] || componentId;
}

export { GENE_ENSEMBL_MAP, DISEASE_EFO_MAP, BIOMARKER_GENE_MAP };
