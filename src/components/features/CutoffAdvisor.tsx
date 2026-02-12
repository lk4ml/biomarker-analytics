// Feature 3: Biomarker Cutoff Recommendation Engine
import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
// ScrollArea not needed in this component
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Zap, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { TrialBiomarkerUsage, CutoffTrend } from '@/types';

interface CutoffAdvisorProps {
  trials: TrialBiomarkerUsage[];
  cutoffTrends: CutoffTrend[];
  indication: string;
  biomarkers: string[];
}

interface CutoffRecommendation {
  biomarker: string;
  recommendedCutoff: string;
  unit: string;
  confidence: 'High' | 'Medium' | 'Low';
  rationale: string;
  fdaApproved: boolean;
  alternativeCutoffs: string[];
  trendDirection: 'Stable' | 'Decreasing' | 'Increasing' | 'Evolving';
  recentTrials: number;
  historicalContext: string;
}

// Knowledge base: FDA-approved cutoffs and established standards
const CUTOFF_KNOWLEDGE: Record<string, Record<string, {
  recommended: string;
  unit: string;
  fdaApproved: boolean;
  alternatives: string[];
  rationale: string;
  trend: 'Stable' | 'Decreasing' | 'Increasing' | 'Evolving';
  historicalContext: string;
}>> = {
  'PD-L1': {
    'NSCLC': {
      recommended: '≥1% TPS (combo); ≥50% TPS (mono)',
      unit: '% TPS',
      fdaApproved: true,
      alternatives: ['≥50% TPS for monotherapy', '≥1% TPS for combination', 'CPS ≥1 emerging'],
      rationale: 'FDA-approved: TPS ≥50% for pembrolizumab monotherapy (KEYNOTE-024), TPS ≥1% for pembrolizumab + chemo (KEYNOTE-189). Assay harmonization across 22C3, SP263, 28-8 established.',
      trend: 'Stable',
      historicalContext: 'Shifted from TPS ≥50% (2015) to TPS ≥1% (2016) as combination therapy proved benefit across PD-L1 levels. Current trials explore dual biomarker strategies (PD-L1 + CD73, PD-L1 + STK11/KEAP1).',
    },
    'Breast Cancer': {
      recommended: '≥10 CPS',
      unit: 'CPS',
      fdaApproved: true,
      alternatives: ['≥1 CPS', '≥20 CPS exploratory', '≥1% IC (SP142 for atezolizumab)'],
      rationale: 'FDA-approved: CPS ≥10 for pembrolizumab + chemo in TNBC (KEYNOTE-355). CPS ≥1 with SP142 used for atezolizumab (IMpassion130) but FDA approval was withdrawn.',
      trend: 'Stable',
      historicalContext: 'CPS emerged as preferred scoring over TPS in breast cancer. CPS ≥10 is now established standard. Ongoing trials explore CPS in HR+/HER2- breast cancer.',
    },
    'Gastric Cancer': {
      recommended: '≥5 CPS',
      unit: 'CPS',
      fdaApproved: true,
      alternatives: ['≥1 CPS', '≥10 CPS'],
      rationale: 'FDA-approved: CPS ≥5 for nivolumab + chemo in 1L gastric (CheckMate 649). CPS ≥10 shows greatest benefit but CPS ≥5 is approval threshold.',
      trend: 'Stable',
      historicalContext: 'CheckMate 649 established CPS ≥5 as standard. CPS ≥10 subset shows strongest benefit. Emerging dual biomarker: CPS + MSI status.',
    },
    'Cervical Cancer': {
      recommended: '≥1 CPS',
      unit: 'CPS',
      fdaApproved: true,
      alternatives: ['All-comers', '≥10 CPS for enhanced benefit'],
      rationale: 'FDA-approved: CPS ≥1 for pembrolizumab + chemo in cervical cancer (KEYNOTE-826). Benefit seen across all PD-L1 levels.',
      trend: 'Stable',
      historicalContext: 'KEYNOTE-826 showed benefit across PD-L1 levels. CPS ≥1 is recommended minimum. HPV status is also relevant.',
    },
    'Urothelial Carcinoma': {
      recommended: '≥1% TC or IC',
      unit: '% TC/IC',
      fdaApproved: true,
      alternatives: ['≥5% IC (SP142)', '≥25% TC (SP263)', 'All-comers in adjuvant'],
      rationale: 'Multiple assays with different cutoffs. SP142 ≥5% IC for atezolizumab. 28-8 ≥1% TC for nivolumab adjuvant (CheckMate 274).',
      trend: 'Evolving',
      historicalContext: 'Urothelial has the most complex PD-L1 landscape with assay-specific cutoffs. Trend toward all-comer approaches in adjuvant settings.',
    },
    'Head & Neck SCC': {
      recommended: '≥1 CPS',
      unit: 'CPS',
      fdaApproved: true,
      alternatives: ['≥20 CPS for enhanced benefit', 'TPS ≥50%'],
      rationale: 'FDA-approved: CPS ≥1 for pembrolizumab in R/M HNSCC (KEYNOTE-048). CPS ≥20 subset shows greatest benefit.',
      trend: 'Stable',
      historicalContext: 'KEYNOTE-048 established CPS ≥1 as standard. CPS is preferred over TPS. HPV status stratification is also key.',
    },
  },
  'TMB': {
    'NSCLC': {
      recommended: '≥10 mut/Mb',
      unit: 'mut/Mb',
      fdaApproved: true,
      alternatives: ['≥16 mut/Mb (blood TMB)', '≥20 mut/Mb (blood TMB historical)'],
      rationale: 'FDA-approved: TMB ≥10 mut/Mb via FoundationOne CDx for pembrolizumab pan-tumor (KEYNOTE-158). Blood TMB thresholds remain higher (16-20 mut/Mb).',
      trend: 'Stable',
      historicalContext: 'Converged on 10 mut/Mb for tissue TMB. Blood TMB standardization ongoing. Friends of Cancer Research consensus (2025) recommends universal 10 mut/Mb with panel calibration.',
    },
  },
  'HER2': {
    'Breast Cancer': {
      recommended: 'IHC 3+ or IHC 2+/FISH+; HER2-low: IHC 1+ or 2+/FISH-',
      unit: 'IHC/FISH',
      fdaApproved: true,
      alternatives: ['HER2-ultralow (IHC 0 with faint staining)', 'Quantitative HER2 scoring'],
      rationale: 'FDA-approved: HER2 3+ or 2+/FISH+ for trastuzumab/pertuzumab. HER2-low (1+, 2+/FISH-) for T-DXd (DESTINY-Breast04). HER2-ultralow category emerging (2024-2025).',
      trend: 'Evolving',
      historicalContext: 'Paradigm shift from binary (positive/negative) to spectrum. DESTINY-Breast04 established HER2-low. By 2025, HER2-ultralow trials enrolling. Testing must now be more granular.',
    },
    'Gastric Cancer': {
      recommended: 'IHC 2+/ISH+ or 3+',
      unit: 'IHC/ISH',
      fdaApproved: true,
      alternatives: ['HER2-low (IHC 1+ or 2+/ISH-)', 'IHC 2+ for T-DXd expansion'],
      rationale: 'FDA-approved: IHC 3+ or 2+/ISH+ for trastuzumab + chemo. DESTINY-Gastric expanded to HER2 IHC 2+ for T-DXd.',
      trend: 'Evolving',
      historicalContext: 'Following breast cancer trajectory. HER2-low concept expanding into gastric. VIKTORY-2 exploring T-DXd in HER2-low gastric.',
    },
    'NSCLC': {
      recommended: 'HER2 overexpression (IHC 2+/3+) or HER2 mutation',
      unit: 'IHC or mutation',
      fdaApproved: false,
      alternatives: ['HER2 mutation (exon 20 insertion)', 'IHC 3+'],
      rationale: 'T-DXd approved for HER2-mutant NSCLC. HER2 overexpression (IHC 2+/3+) being explored in DESTINY-Lung06 (Phase 3).',
      trend: 'Increasing',
      historicalContext: 'HER2 as NSCLC target is relatively new. Both overexpression and mutation are being explored. DESTINY-Lung06 is the first randomized Phase 3.',
    },
  },
  'MSI': {
    'Colorectal Cancer': {
      recommended: 'MSI-H/dMMR',
      unit: 'status',
      fdaApproved: true,
      alternatives: ['dMMR by IHC (MLH1, MSH2, MSH6, PMS2)', 'MSI by PCR', 'MSI by NGS'],
      rationale: 'FDA-approved: MSI-H/dMMR for pembrolizumab 1L CRC (KEYNOTE-177) and nivolumab+ipilimumab (CheckMate 8HW). IHC and PCR are interchangeable.',
      trend: 'Stable',
      historicalContext: 'MSI-H/dMMR is well established. AI-powered H&E-based MSI detection (97% concordance with PCR) may eliminate need for molecular testing.',
    },
    'Endometrial Cancer': {
      recommended: 'dMMR/MSI-H',
      unit: 'MMR status',
      fdaApproved: true,
      alternatives: ['pMMR for distinct treatment approach', 'TMB ≥10 as alternative'],
      rationale: 'FDA-approved: dostarlimab for dMMR endometrial (GARNET). Pembrolizumab + lenvatinib for pMMR endometrial. MMR status is critical stratification.',
      trend: 'Stable',
      historicalContext: 'dMMR/MSI-H stratification is mandatory in endometrial cancer. pMMR patients receive IO+lenvatinib. Emerging pMMR-specific strategies (TroFuse-033).',
    },
  },
  'KRAS': {
    'NSCLC': {
      recommended: 'G12C mutation',
      unit: 'mutation',
      fdaApproved: true,
      alternatives: ['G12D (emerging)', 'G12C + PD-L1 TPS≥50% (dual biomarker)', 'Any KRAS mutation'],
      rationale: 'FDA-approved: KRAS G12C for sotorasib (CodeBreaK 200) and adagrasib (KRYSTAL-12). G12D inhibitors in Phase 1. KANDLELIT-004 explores dual biomarker (G12C + PD-L1≥50%).',
      trend: 'Evolving',
      historicalContext: 'G12C was "undruggable" until 2020. Now the primary battleground is 1L combination (KRAS G12C + IO). G12D and G13C inhibitors expanding the landscape.',
    },
    'Colorectal Cancer': {
      recommended: 'G12C mutation',
      unit: 'mutation',
      fdaApproved: false,
      alternatives: ['Any KRAS mutation (anti-EGFR exclusion)', 'KRAS wild-type (for anti-EGFR)'],
      rationale: 'KRAS G12C inhibitors show activity in CRC (CodeBreaK 101, KRYSTAL-1). KRAS WT is required for anti-EGFR therapy (cetuximab/panitumumab).',
      trend: 'Evolving',
      historicalContext: 'KRAS testing in CRC historically for anti-EGFR selection. Now direct KRAS targeting with G12C inhibitors + anti-EGFR combinations.',
    },
  },
  'EGFR': {
    'NSCLC': {
      recommended: 'Exon 19 deletion or L858R',
      unit: 'mutation',
      fdaApproved: true,
      alternatives: ['T790M (resistance)', 'Exon 20 insertion', 'Uncommon mutations (G719X, L861Q, S768I)'],
      rationale: 'FDA-approved: Ex19del/L858R for osimertinib 1L (FLAURA) and adjuvant (ADAURA). Exon 20 ins for amivantamab. cobas EGFR Mutation Test v2 is CDx.',
      trend: 'Stable',
      historicalContext: 'EGFR testing is standard of care. MARIPOSA (amivantamab+lazertinib) challenging osimertinib in 1L. Resistance biomarkers (C797S, MET amp) increasingly important.',
    },
  },
  'BRCA1/2': {
    'Ovarian Cancer': {
      recommended: 'BRCA1/2 pathogenic mutation',
      unit: 'mutation',
      fdaApproved: true,
      alternatives: ['HRD score (≥42 with Myriad)', 'Somatic BRCA (tumor testing)', 'HRR gene panel'],
      rationale: 'FDA-approved: BRCA1/2 for olaparib maintenance (SOLO-1). BRACAnalysis CDx is companion diagnostic. HRD testing expands to non-BRCA HRR mutations.',
      trend: 'Stable',
      historicalContext: 'BRCA testing is established. HRD score expanding eligibility. PARP+IO combinations under investigation. KEYLYNK-001 explores BRCA-WT patients.',
    },
    'Breast Cancer': {
      recommended: 'gBRCA1/2 pathogenic mutation',
      unit: 'mutation',
      fdaApproved: true,
      alternatives: ['Somatic BRCA', 'HRD score'],
      rationale: 'FDA-approved: gBRCA1/2 for olaparib adjuvant (OLYMPIA). BRACAnalysis CDx is companion diagnostic.',
      trend: 'Stable',
      historicalContext: 'Germline BRCA testing standard for HER2- breast cancer. Adjuvant olaparib (OLYMPIA) is paradigm-changing.',
    },
    'Prostate Cancer': {
      recommended: 'BRCA1/2 or HRR mutations',
      unit: 'mutation',
      fdaApproved: true,
      alternatives: ['ATM mutation', 'HRR panel (PALB2, CHEK2, RAD51C, etc.)'],
      rationale: 'FDA-approved: BRCA/ATM/HRR for olaparib (PROfound). FoundationOne CDx is companion diagnostic.',
      trend: 'Stable',
      historicalContext: 'PROfound established HRR testing in mCRPC. Panel testing (beyond BRCA alone) is standard. Germline + somatic testing recommended.',
    },
  },
  'ALK': {
    'NSCLC': {
      recommended: 'ALK rearrangement/fusion',
      unit: 'fusion',
      fdaApproved: true,
      alternatives: ['ALK compound mutations (resistance)', 'ALK fusion variant (EML4-ALK V1/V3)'],
      rationale: 'FDA-approved: ALK fusion for alectinib (ALEX), lorlatinib (CROWN). Ventana D5F3 IHC is CDx. FISH and NGS also acceptable.',
      trend: 'Stable',
      historicalContext: 'ALK testing well established. Compound mutations emerging as resistance biomarkers (35% of lorlatinib-resistant patients). Sequential liquid biopsy for resistance monitoring.',
    },
  },
  'BRAF': {
    'Melanoma': {
      recommended: 'V600E or V600K mutation',
      unit: 'mutation',
      fdaApproved: true,
      alternatives: ['V600E only', 'Non-V600 BRAF mutations (Class II/III)'],
      rationale: 'FDA-approved: V600E/K for dabrafenib+trametinib (COMBI-d) and vemurafenib+cobimetinib (coBRIM). cobas 4800 and THxID are CDx.',
      trend: 'Stable',
      historicalContext: 'BRAF V600 testing is mandatory in melanoma. Non-V600 mutations (Class II/III) do not respond to V600 inhibitors but may respond to other approaches.',
    },
    'Colorectal Cancer': {
      recommended: 'V600E mutation',
      unit: 'mutation',
      fdaApproved: false,
      alternatives: ['Any BRAF mutation'],
      rationale: 'BRAF V600E indicates poor prognosis in CRC. Encorafenib+binimetinib+cetuximab (BEACON) targets V600E. Not FDA-required CDx but testing is standard.',
      trend: 'Stable',
      historicalContext: 'BEACON established triplet therapy for BRAF V600E CRC. BRAF testing is part of standard molecular profiling.',
    },
  },
  'ctDNA': {
    'Colorectal Cancer': {
      recommended: 'ctDNA-positive (MRD detectable)',
      unit: 'detection',
      fdaApproved: false,
      alternatives: ['Tumor-informed (Signatera)', 'Tumor-agnostic (Guardant)', 'Methylation-based'],
      rationale: 'ctDNA MRD is emerging as adjuvant treatment selection biomarker. CIRCULATE and DYNAMIC trials show ctDNA-guided approach can reduce unnecessary chemo by 50%.',
      trend: 'Increasing',
      historicalContext: 'MRD-guided adjuvant therapy is the next paradigm shift. Signatera (Natera) dominates recruiting trials. Phase 3 trials ongoing.',
    },
    'NSCLC': {
      recommended: 'ctDNA response/clearance',
      unit: 'detection',
      fdaApproved: false,
      alternatives: ['ctDNA MRD for adjuvant', 'ctDNA response-adaptive (CCTG)'],
      rationale: 'ctDNA monitoring for treatment response and MRD in NSCLC. MERMAID-1 (durvalumab adjuvant by ctDNA) and CCTG response-adaptive trial are pioneers.',
      trend: 'Increasing',
      historicalContext: 'Following CRC trajectory. MERMAID-1 completed 2025. CCTG trial is pioneering response-adaptive IO based on ctDNA kinetics.',
    },
    'Breast Cancer': {
      recommended: 'ctDNA MRD detectable',
      unit: 'detection',
      fdaApproved: false,
      alternatives: ['Persistent ctDNA post-surgery', 'ctDNA dynamics on CDK4/6i'],
      rationale: 'ctDNA MRD monitoring in early BC emerging. Multiple platforms (Signatera, Guardant, RaDaR). Phase 2 trials underway.',
      trend: 'Increasing',
      historicalContext: 'Breast cancer ctDNA trials are earlier stage than CRC. Focus on identifying high-risk patients for treatment intensification.',
    },
  },
  'NTRK': {
    'NSCLC': {
      recommended: 'NTRK1/2/3 fusion',
      unit: 'fusion',
      fdaApproved: true,
      alternatives: ['RNA-based detection preferred', 'DNA-based NGS', 'Pan-TRK IHC screen'],
      rationale: 'FDA-approved: NTRK fusion for larotrectinib and entrectinib (tumor-agnostic). ESMO 2025 recommends RNA-based NGS as preferred detection method.',
      trend: 'Stable',
      historicalContext: 'NTRK fusions are rare (<1%) but tumor-agnostic approval. RNA-based assays preferred over DNA due to better sensitivity. IHC can be used as screen.',
    },
  },
};

export function CutoffAdvisor({ trials, cutoffTrends, indication, biomarkers }: CutoffAdvisorProps) {
  // Generate recommendations for each relevant biomarker
  const recommendations = useMemo((): CutoffRecommendation[] => {
    return biomarkers.map(bm => {
      const knowledge = CUTOFF_KNOWLEDGE[bm]?.[indication];
      const bmTrials = trials.filter(t => t.biomarkerName === bm);
      const recentTrials = bmTrials.filter(t => t.startYear >= 2023).length;

      if (knowledge) {
        const confidence: CutoffRecommendation['confidence'] = knowledge.fdaApproved ? 'High' : (recentTrials > 2 ? 'Medium' : 'Low');
        return {
          biomarker: bm,
          recommendedCutoff: knowledge.recommended,
          unit: knowledge.unit,
          confidence,
          rationale: knowledge.rationale,
          fdaApproved: knowledge.fdaApproved,
          alternativeCutoffs: knowledge.alternatives,
          trendDirection: knowledge.trend,
          recentTrials,
          historicalContext: knowledge.historicalContext,
        };
      }

      // Fallback: derive from trial data
      const cutoffValues = bmTrials.map(t => t.cutoffValue).filter(Boolean);
      const mostCommon = cutoffValues.length > 0
        ? cutoffValues.sort((a, b) =>
            cutoffValues.filter(v => v === b).length - cutoffValues.filter(v => v === a).length
          )[0]
        : 'assessed';

      return {
        biomarker: bm,
        recommendedCutoff: mostCommon,
        unit: bmTrials[0]?.cutoffUnit || 'various',
        confidence: 'Low' as const,
        rationale: `Based on ${bmTrials.length} trials in ${indication}. Most common cutoff: ${mostCommon}. Limited standardization data available.`,
        fdaApproved: false,
        alternativeCutoffs: [...new Set(cutoffValues)].slice(0, 3),
        trendDirection: 'Evolving' as const,
        recentTrials,
        historicalContext: `${bmTrials.length} trials track ${bm} in ${indication}. Further evidence needed for standardized cutoff.`,
      };
    }).filter(r => r.biomarker);
  }, [trials, indication, biomarkers]);

  // Cutoff trend charts
  const trendCharts = useMemo(() => {
    const charts: Array<{ biomarker: string; data: CutoffTrend[] }> = [];
    const seen = new Set<string>();
    cutoffTrends.forEach(c => {
      const key = `${c.biomarkerName}-${c.tumorType}`;
      if (!seen.has(key) && c.tumorType === indication) {
        seen.add(key);
        charts.push({
          biomarker: c.biomarkerName,
          data: cutoffTrends.filter(x => x.biomarkerName === c.biomarkerName && x.tumorType === c.tumorType),
        });
      }
    });
    return charts;
  }, [cutoffTrends, indication]);

  const trendColors = ['#0ea5e9', '#22c55e', '#a855f7', '#ec4899', '#f97316', '#06b6d4'];

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-sky-200 bg-sky-50/50">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-600 rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-sky-900">Biomarker Cutoff Advisor — {indication}</h3>
              <p className="text-xs text-sky-700">Evidence-based cutoff recommendations derived from FDA approvals, Phase 3 data, and emerging trial evidence</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations Grid */}
      <div className="grid grid-cols-2 gap-4">
        {recommendations.map((rec) => (
          <Card key={rec.biomarker} className="border-stone-200 hover:border-stone-300 transition-colors">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-bold">{rec.biomarker}</Badge>
                  {rec.fdaApproved && (
                    <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">
                      <CheckCircle2 className="w-3 h-3 mr-0.5" /> FDA CDx
                    </Badge>
                  )}
                </div>
                <Badge className={`text-[10px] ${
                  rec.confidence === 'High' ? 'bg-emerald-100 text-emerald-700' :
                  rec.confidence === 'Medium' ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {rec.confidence} Confidence
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {/* Recommended Cutoff */}
              <div className="bg-stone-50 rounded-lg p-3 mb-3">
                <p className="text-[10px] text-stone-500 mb-1">RECOMMENDED CUTOFF</p>
                <p className="text-sm font-bold text-stone-900">{rec.recommendedCutoff}</p>
              </div>

              {/* Rationale */}
              <p className="text-[11px] text-stone-600 leading-relaxed mb-3">{rec.rationale}</p>

              {/* Trend */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-stone-500">Trend:</span>
                <Badge variant="outline" className={`text-[10px] ${
                  rec.trendDirection === 'Stable' ? 'text-emerald-600 border-emerald-300' :
                  rec.trendDirection === 'Evolving' ? 'text-amber-600 border-amber-300' :
                  rec.trendDirection === 'Increasing' ? 'text-sky-600 border-sky-300' :
                  'text-purple-600 border-purple-300'
                }`}>
                  <TrendingUp className="w-3 h-3 mr-0.5" />
                  {rec.trendDirection}
                </Badge>
                <span className="text-[10px] text-stone-400">{rec.recentTrials} trials since 2023</span>
              </div>

              {/* Alternatives */}
              {rec.alternativeCutoffs.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] text-stone-500 mb-1">Alternative Cutoffs:</p>
                  <div className="flex flex-wrap gap-1">
                    {rec.alternativeCutoffs.map((alt, j) => (
                      <Badge key={j} variant="secondary" className="text-[9px] py-0">{alt}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Historical Context */}
              <div className="mt-3 p-2 bg-amber-50 rounded text-[10px] text-amber-800 leading-relaxed">
                <AlertTriangle className="w-3 h-3 inline-block mr-1" />
                {rec.historicalContext}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trend Charts */}
      {trendCharts.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {trendCharts.map((chart, ci) => (
            <Card key={chart.biomarker} className="border-stone-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{chart.biomarker} Cutoff Evolution — {indication}</CardTitle>
                <CardDescription className="text-xs">Historical cutoff values and trial adoption over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chart.data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                    <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} label={{ value: 'Trials', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} label={{ value: 'Cutoff', angle: 90, position: 'insideRight', style: { fontSize: 10 } }} />
                    <RechartsTooltip contentStyle={{ fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line yAxisId="left" type="monotone" dataKey="trialCount" name="Trial Count" stroke={trendColors[ci % trendColors.length]} strokeWidth={2} dot={{ r: 3 }} />
                    <Line yAxisId="right" type="stepAfter" dataKey="cutoffValue" name="Cutoff Value" stroke="#f97316" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
