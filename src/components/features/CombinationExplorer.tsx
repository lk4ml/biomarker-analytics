// Feature 6: Multi-Biomarker Combination Explorer
import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';
import { GitBranch, Combine, TrendingUp, ExternalLink, Zap } from 'lucide-react';
import type { TrialBiomarkerUsage } from '@/types';

interface CombinationExplorerProps {
  trials: TrialBiomarkerUsage[];
  indication: string;
}

interface BiomarkerPair {
  primary: string;
  secondary: string;
  coOccurrence: number;
  trials: TrialBiomarkerUsage[];
  strategy: string;
  rationale: string;
  isEmerging: boolean;
}

// Known dual-biomarker strategies
const KNOWN_COMBINATIONS: Record<string, Record<string, {
  strategy: string;
  rationale: string;
  emerging: boolean;
}>> = {
  'PD-L1+TMB': {
    'NSCLC': {
      strategy: 'Dual immune biomarker enrichment',
      rationale: 'PD-L1 and TMB capture different aspects of tumor immunogenicity. High TMB + PD-L1+ patients have highest IO response rates. CheckMate 227 explored this combination.',
      emerging: false,
    },
    default: {
      strategy: 'Comprehensive immune profiling',
      rationale: 'PD-L1 expression and TMB together improve prediction of checkpoint inhibitor response across solid tumors.',
      emerging: false,
    },
  },
  'KRAS+PD-L1': {
    'NSCLC': {
      strategy: 'KRAS G12C inhibitor + IO combination selection',
      rationale: 'KANDLELIT-004 selects KRAS G12C AND PD-L1 TPS≥50% for MK-1084 + pembrolizumab. Dual biomarker maximizes benefit-risk.',
      emerging: true,
    },
    default: {
      strategy: 'Targeted + IO combination biomarker',
      rationale: 'KRAS mutation + PD-L1 status can guide targeted + IO combination therapy selection.',
      emerging: true,
    },
  },
  'PD-L1+ctDNA': {
    default: {
      strategy: 'IO response + MRD monitoring',
      rationale: 'PD-L1 for IO selection combined with ctDNA for response monitoring and MRD detection. Emerging adaptive treatment paradigm.',
      emerging: true,
    },
  },
  'HER2+PD-L1': {
    'Breast Cancer': {
      strategy: 'ADC + IO combination selection',
      rationale: 'HER2 status (including HER2-low/ultralow) for T-DXd eligibility + PD-L1 for IO benefit in TNBC. Expanding dual targeting.',
      emerging: true,
    },
    default: {
      strategy: 'ADC + checkpoint combination',
      rationale: 'HER2-directed ADC + PD-L1/PD-1 combinations are being explored across multiple tumor types.',
      emerging: true,
    },
  },
  'MSI+TMB': {
    default: {
      strategy: 'Hypermutated tumor identification',
      rationale: 'MSI-H tumors often have high TMB. Dual testing captures both dMMR-driven and other hypermutation mechanisms for IO response prediction.',
      emerging: false,
    },
  },
  'BRCA1/2+PD-L1': {
    'Ovarian Cancer': {
      strategy: 'PARP inhibitor + IO combination',
      rationale: 'BRCA status for PARP eligibility + PD-L1 for IO benefit. KEYLYNK-001 explored pembrolizumab + olaparib maintenance.',
      emerging: true,
    },
    default: {
      strategy: 'DNA repair + immune checkpoint dual targeting',
      rationale: 'BRCA deficiency creates immunogenic tumors. Dual biomarker guides PARP + IO combination eligibility.',
      emerging: true,
    },
  },
  'EGFR+ctDNA': {
    'NSCLC': {
      strategy: 'Molecular monitoring of TKI resistance',
      rationale: 'EGFR mutation for TKI selection + ctDNA for resistance monitoring (T790M, C797S, MET amplification). Sequential liquid biopsy paradigm.',
      emerging: false,
    },
  },
  'ALK+ctDNA': {
    'NSCLC': {
      strategy: 'Resistance mutation monitoring',
      rationale: 'ALK fusion for TKI selection + ctDNA for compound mutation resistance monitoring. 35% of lorlatinib-resistant patients develop compound ALK mutations.',
      emerging: true,
    },
  },
  'BRAF+MSI': {
    'Colorectal Cancer': {
      strategy: 'Prognostic stratification + treatment selection',
      rationale: 'BRAF V600E in CRC indicates poor prognosis EXCEPT in MSI-H tumors. Dual testing is essential for prognosis and treatment selection.',
      emerging: false,
    },
  },
  'PD-L1+TILs': {
    default: {
      strategy: 'Tumor microenvironment profiling',
      rationale: 'PD-L1 + TILs together provide more comprehensive immune contexture assessment. High TILs + PD-L1+ tumors are most responsive to IO.',
      emerging: true,
    },
  },
};

export function CombinationExplorer({ trials, indication }: CombinationExplorerProps) {
  // Find all biomarker pairs in the trial data
  const biomarkerPairs = useMemo((): BiomarkerPair[] => {
    const pairs: BiomarkerPair[] = [];
    const biomarkerTrials = new Map<string, Set<string>>();

    // Group trials by NCT ID to find co-occurrence
    const trialBiomarkers = new Map<string, string[]>();
    trials.forEach(t => {
      if (!trialBiomarkers.has(t.nctId)) {
        trialBiomarkers.set(t.nctId, []);
      }
      trialBiomarkers.get(t.nctId)!.push(t.biomarkerName);

      if (!biomarkerTrials.has(t.biomarkerName)) {
        biomarkerTrials.set(t.biomarkerName, new Set());
      }
      biomarkerTrials.get(t.biomarkerName)!.add(t.nctId);
    });

    const biomarkers = Array.from(biomarkerTrials.keys());

    // Also detect dual biomarker mentions in trial titles
    trials.forEach(t => {
      const title = t.trialTitle.toLowerCase();
      biomarkers.forEach(bm => {
        if (bm !== t.biomarkerName) {
          const bmLower = bm.toLowerCase();
          if (title.includes(bmLower) || title.includes(bmLower.replace('/', ''))) {
            if (!trialBiomarkers.has(t.nctId)) {
              trialBiomarkers.set(t.nctId, [t.biomarkerName]);
            }
            const existing = trialBiomarkers.get(t.nctId)!;
            if (!existing.includes(bm)) {
              existing.push(bm);
            }
          }
        }
      });
    });

    // Build pairs
    const seenPairs = new Set<string>();
    for (let i = 0; i < biomarkers.length; i++) {
      for (let j = i + 1; j < biomarkers.length; j++) {
        const bm1 = biomarkers[i];
        const bm2 = biomarkers[j];
        const pairKey = [bm1, bm2].sort().join('+');

        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        // Find trials with both biomarkers
        const coTrials = trials.filter(t => {
          const nctBiomarkers = trialBiomarkers.get(t.nctId) || [];
          return nctBiomarkers.includes(bm1) && nctBiomarkers.includes(bm2);
        });

        // Also count overlap from same-NCT different biomarker entries
        const set1 = biomarkerTrials.get(bm1) || new Set();
        const set2 = biomarkerTrials.get(bm2) || new Set();
        const intersection = new Set([...set1].filter(x => set2.has(x)));

        const coOccurrence = Math.max(coTrials.length, intersection.size);
        if (coOccurrence === 0) continue;

        const knowledge = KNOWN_COMBINATIONS[pairKey]?.[indication] ||
                         KNOWN_COMBINATIONS[pairKey]?.default;

        pairs.push({
          primary: bm1,
          secondary: bm2,
          coOccurrence,
          trials: coTrials,
          strategy: knowledge?.strategy || `${bm1} + ${bm2} co-testing`,
          rationale: knowledge?.rationale || `${bm1} and ${bm2} are both assessed in ${coOccurrence} trials for ${indication}. Co-testing may improve patient stratification.`,
          isEmerging: knowledge?.emerging ?? true,
        });
      }
    }

    // Add known combinations not in data
    Object.entries(KNOWN_COMBINATIONS).forEach(([pairKey, indications]) => {
      if (seenPairs.has(pairKey)) return;
      const knowledge = indications[indication] || indications.default;
      if (!knowledge) return;

      const [bm1, bm2] = pairKey.split('+');
      if (!biomarkers.includes(bm1) && !biomarkers.includes(bm2)) return;

      pairs.push({
        primary: bm1,
        secondary: bm2,
        coOccurrence: 0,
        trials: [],
        strategy: knowledge.strategy,
        rationale: knowledge.rationale,
        isEmerging: knowledge.emerging,
      });
    });

    return pairs.sort((a, b) => b.coOccurrence - a.coOccurrence);
  }, [trials, indication]);

  // Combination frequency chart
  const chartData = biomarkerPairs
    .filter(p => p.coOccurrence > 0)
    .slice(0, 10)
    .map(p => ({
      pair: `${p.primary}+${p.secondary}`,
      trials: p.coOccurrence,
    }));

  // Co-occurrence matrix
  const matrixData = useMemo(() => {
    const biomarkers = [...new Set(trials.map(t => t.biomarkerName))];
    const matrix: Record<string, Record<string, number>> = {};

    biomarkers.forEach(bm1 => {
      matrix[bm1] = {};
      biomarkers.forEach(bm2 => {
        if (bm1 === bm2) {
          matrix[bm1][bm2] = trials.filter(t => t.biomarkerName === bm1).length;
        } else {
          const pair = biomarkerPairs.find(p =>
            (p.primary === bm1 && p.secondary === bm2) ||
            (p.primary === bm2 && p.secondary === bm1)
          );
          matrix[bm1][bm2] = pair?.coOccurrence || 0;
        }
      });
    });

    return { biomarkers, matrix };
  }, [trials, biomarkerPairs]);

  // Emerging vs established split
  const emergingCombos = biomarkerPairs.filter(p => p.isEmerging);
  const establishedCombos = biomarkerPairs.filter(p => !p.isEmerging);

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-purple-200 bg-purple-50/50">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
              <Combine className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-purple-900">Multi-Biomarker Combination Explorer — {indication}</h3>
              <p className="text-xs text-purple-700">
                {biomarkerPairs.length} biomarker combinations identified • {emergingCombos.length} emerging strategies • {establishedCombos.length} established
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        {/* Combination Frequency Chart */}
        <Card className="border-stone-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Biomarker Co-occurrence in Trials</CardTitle>
            <CardDescription className="text-xs">Number of trials testing multiple biomarkers together</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="pair" type="category" tick={{ fontSize: 9 }} width={100} />
                  <RechartsTooltip contentStyle={{ fontSize: 11 }} />
                  <Bar dataKey="trials" fill="#a855f7" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-12 text-center">
                <GitBranch className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                <p className="text-xs text-stone-400">No multi-biomarker trial co-occurrence detected in current data</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Co-occurrence Matrix */}
        <Card className="border-stone-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Biomarker Co-occurrence Matrix</CardTitle>
            <CardDescription className="text-xs">Heatmap of biomarker pair frequency in {indication} trials</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="min-w-[400px]">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr>
                      <th className="text-left py-1 px-1"></th>
                      {matrixData.biomarkers.map(bm => (
                        <th key={bm} className="text-center py-1 px-1 text-stone-500 font-medium" style={{ writingMode: 'vertical-rl', height: 60 }}>{bm}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixData.biomarkers.map(bm1 => (
                      <tr key={bm1} className="border-t border-stone-100">
                        <td className="py-1 px-1 text-stone-700 font-medium">{bm1}</td>
                        {matrixData.biomarkers.map(bm2 => {
                          const val = matrixData.matrix[bm1]?.[bm2] || 0;
                          const isDiagonal = bm1 === bm2;
                          return (
                            <td key={bm2} className="text-center py-1 px-1">
                              <span
                                className={`inline-flex items-center justify-center w-6 h-6 rounded text-[9px] font-bold ${
                                  isDiagonal ? 'bg-stone-200 text-stone-600' :
                                  val >= 3 ? 'bg-purple-500 text-white' :
                                  val >= 2 ? 'bg-purple-300 text-purple-900' :
                                  val >= 1 ? 'bg-purple-100 text-purple-700' :
                                  'text-stone-200'
                                }`}
                              >
                                {val > 0 ? val : '-'}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Combination Strategy Cards */}
      <Card className="border-stone-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Multi-Biomarker Strategies</CardTitle>
          <CardDescription className="text-xs">Established and emerging dual/multi-biomarker strategies for {indication}</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[450px]">
            <div className="space-y-3">
              {biomarkerPairs.map((pair, i) => (
                <div key={i} className={`p-4 rounded-lg border ${
                  pair.isEmerging ? 'border-amber-200 bg-amber-50/30' : 'border-emerald-200 bg-emerald-50/30'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs font-bold">{pair.primary}</Badge>
                      <Zap className="w-3 h-3 text-stone-400" />
                      <Badge variant="outline" className="text-xs font-bold">{pair.secondary}</Badge>
                      {pair.isEmerging ? (
                        <Badge className="bg-amber-100 text-amber-700 text-[9px]">
                          <TrendingUp className="w-3 h-3 mr-0.5" /> Emerging
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">Established</Badge>
                      )}
                    </div>
                    {pair.coOccurrence > 0 && (
                      <span className="text-[10px] text-stone-500">{pair.coOccurrence} co-occurring trials</span>
                    )}
                  </div>

                  <p className="text-xs font-semibold text-stone-800 mb-1">{pair.strategy}</p>
                  <p className="text-[11px] text-stone-600 leading-relaxed mb-2">{pair.rationale}</p>

                  {pair.trials.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {pair.trials.slice(0, 3).map(t => (
                        <a
                          key={t.nctId}
                          href={`https://clinicaltrials.gov/study/${t.nctId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-[10px] text-sky-600 hover:underline"
                        >
                          {t.nctId} <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ))}
                      {pair.trials.length > 3 && (
                        <span className="text-[10px] text-stone-400">+{pair.trials.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {biomarkerPairs.length === 0 && (
                <div className="py-12 text-center">
                  <Combine className="w-10 h-10 text-stone-300 mx-auto mb-3" />
                  <p className="text-xs text-stone-400">No multi-biomarker combinations found for {indication}.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
