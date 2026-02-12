// Feature 8: Biomarker Evidence Grading System
import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Shield, Star, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import type { TrialBiomarkerUsage, AssayInfo } from '@/types';

interface EvidenceGradingProps {
  trials: TrialBiomarkerUsage[];
  assays: AssayInfo[];
  indication: string;
  biomarkers: string[];
}

interface EvidenceScore {
  biomarker: string;
  level: 1 | 2 | 3 | 4;
  levelLabel: string;
  overallScore: number; // 0-100
  fdaCdxApproved: boolean;
  fdaDrugApproved: boolean;
  phase3Completed: number;
  phase3Recruiting: number;
  phase2Count: number;
  guidelineInclusion: boolean;
  totalTrials: number;
  recruitingTrials: number;
  assayStandardized: boolean;
  components: {
    regulatory: number;     // FDA approval weight
    clinical: number;       // Phase 3 evidence
    emerging: number;       // Phase 2 / recruiting
    diagnostic: number;     // CDx availability
    guideline: number;      // NCCN/ESMO guidelines
  };
  summary: string;
  actionability: string;
}

// Guideline inclusion knowledge base
const GUIDELINE_BIOMARKERS: Record<string, Record<string, boolean>> = {
  'NSCLC': { 'PD-L1': true, 'EGFR': true, 'ALK': true, 'KRAS': true, 'BRAF': true, 'TMB': true, 'NTRK': true, 'HER2': true, 'MSI': true },
  'Breast Cancer': { 'HER2': true, 'PD-L1': true, 'BRCA1/2': true, 'MSI': true },
  'Melanoma': { 'BRAF': true, 'PD-L1': true, 'TMB': true, 'NTRK': true },
  'Colorectal Cancer': { 'MSI': true, 'KRAS': true, 'BRAF': true, 'HER2': true, 'NTRK': true },
  'Urothelial Carcinoma': { 'PD-L1': true, 'EGFR': true },
  'Head & Neck SCC': { 'PD-L1': true },
  'Gastric Cancer': { 'HER2': true, 'PD-L1': true, 'MSI': true },
  'Hepatocellular Carcinoma': { 'PD-L1': true },
  'Renal Cell Carcinoma': { 'PD-L1': true },
  'Ovarian Cancer': { 'BRCA1/2': true, 'MSI': true },
  'Endometrial Cancer': { 'MSI': true, 'PD-L1': true, 'TMB': true },
  'Prostate Cancer': { 'BRCA1/2': true, 'MSI': true },
  'Pancreatic Cancer': { 'BRCA1/2': true, 'MSI': true, 'NTRK': true },
  'Cervical Cancer': { 'PD-L1': true },
};

const LEVEL_COLORS = {
  1: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300', fill: '#22c55e' },
  2: { bg: 'bg-sky-100', text: 'text-sky-800', border: 'border-sky-300', fill: '#0ea5e9' },
  3: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300', fill: '#eab308' },
  4: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300', fill: '#ef4444' },
};

const LEVEL_LABELS = {
  1: 'FDA-Approved CDx',
  2: 'Phase 3 Validated',
  3: 'Phase 2 Signal',
  4: 'Early / Preclinical',
};

const LEVEL_ICONS = {
  1: Shield,
  2: Star,
  3: AlertTriangle,
  4: Clock,
};

export function EvidenceGrading({ trials, assays, indication, biomarkers }: EvidenceGradingProps) {
  const scores = useMemo((): EvidenceScore[] => {
    return biomarkers.map(bm => {
      const bmTrials = trials.filter(t => t.biomarkerName === bm);
      if (bmTrials.length === 0) return null;

      const phase3Completed = bmTrials.filter(t => t.phase.includes('3') && t.status === 'Completed').length;
      const phase3Recruiting = bmTrials.filter(t => t.phase.includes('3') && (t.status === 'Recruiting' || t.status === 'Active')).length;
      const phase2Count = bmTrials.filter(t => t.phase.includes('2')).length;
      const recruitingTrials = bmTrials.filter(t => t.status === 'Recruiting' || t.status === 'Active').length;

      // CDx check
      const bmAssays = assays.filter(a => a.biomarkers.includes(bm));
      const fdaCdxAssays = bmAssays.filter(a => a.fdaApproved && a.companionDiagnosticFor.length > 0);
      const fdaCdxForIndication = fdaCdxAssays.filter(a =>
        a.companionDiagnosticFor.some(ind =>
          ind.toLowerCase().includes(indication.toLowerCase()) ||
          ind.toLowerCase().includes(indication.split(' ')[0].toLowerCase())
        )
      );

      const fdaCdxApproved = fdaCdxForIndication.length > 0;
      const fdaDrugApproved = bmTrials.some(t => t.companionDiagnostic && t.status === 'Completed');
      const guidelineInclusion = GUIDELINE_BIOMARKERS[indication]?.[bm] || false;
      const assayStandardized = bmAssays.length > 0;

      // Calculate component scores (0-100)
      const regulatory = fdaCdxApproved ? 100 : (fdaCdxAssays.length > 0 ? 60 : 0);
      const clinical = Math.min(100, (phase3Completed * 25) + (phase3Recruiting * 10));
      const emerging = Math.min(100, (phase2Count * 15) + (recruitingTrials * 5));
      const diagnostic = fdaCdxApproved ? 100 : (assayStandardized ? 50 : 0);
      const guideline = guidelineInclusion ? 100 : 0;

      // Overall score (weighted)
      const overallScore = Math.round(
        (regulatory * 0.30) + (clinical * 0.25) + (emerging * 0.15) + (diagnostic * 0.15) + (guideline * 0.15)
      );

      // Determine level
      let level: 1 | 2 | 3 | 4;
      if (fdaCdxApproved && phase3Completed >= 1) level = 1;
      else if (phase3Completed >= 1 || (phase3Recruiting >= 1 && fdaDrugApproved)) level = 2;
      else if (phase2Count >= 1 || phase3Recruiting >= 1) level = 3;
      else level = 4;

      // Generate summary
      const summaryParts: string[] = [];
      if (fdaCdxApproved) summaryParts.push('FDA-approved CDx available');
      if (phase3Completed > 0) summaryParts.push(`${phase3Completed} completed Phase 3 trial(s)`);
      if (phase3Recruiting > 0) summaryParts.push(`${phase3Recruiting} recruiting Phase 3 trial(s)`);
      if (guidelineInclusion) summaryParts.push('Included in NCCN/ESMO guidelines');

      // Actionability
      let actionability: string;
      if (level === 1) actionability = `Standard of care: ${bm} testing required. FDA-approved CDx with established clinical utility in ${indication}.`;
      else if (level === 2) actionability = `Strong evidence: ${bm} testing recommended. Phase 3 data supports clinical use. CDx development may be pending.`;
      else if (level === 3) actionability = `Emerging evidence: ${bm} has Phase 2 signal. Consider testing in clinical trial context. Monitor Phase 3 results.`;
      else actionability = `Investigational: ${bm} testing is exploratory in ${indication}. Limited clinical evidence. Consider for research purposes only.`;

      return {
        biomarker: bm,
        level,
        levelLabel: LEVEL_LABELS[level],
        overallScore,
        fdaCdxApproved,
        fdaDrugApproved,
        phase3Completed,
        phase3Recruiting,
        phase2Count,
        guidelineInclusion,
        totalTrials: bmTrials.length,
        recruitingTrials,
        assayStandardized,
        components: { regulatory, clinical, emerging, diagnostic, guideline },
        summary: summaryParts.join(' • ') || 'Limited evidence available',
        actionability,
      };
    }).filter((s): s is EvidenceScore => s !== null).sort((a, b) => a.level - b.level || b.overallScore - a.overallScore);
  }, [trials, assays, indication, biomarkers]);

  // Chart data
  const chartData = scores.map(s => ({
    biomarker: s.biomarker,
    score: s.overallScore,
    level: s.level,
  }));

  // Level distribution
  const levelDist = [1, 2, 3, 4].map(l => ({
    level: `Level ${l}`,
    label: LEVEL_LABELS[l as 1 | 2 | 3 | 4],
    count: scores.filter(s => s.level === l).length,
    color: LEVEL_COLORS[l as 1 | 2 | 3 | 4].fill,
  }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-emerald-900">Biomarker Evidence Grading — {indication}</h3>
              <p className="text-xs text-emerald-700">
                Tiered evidence assessment: Level 1 (FDA CDx) → Level 4 (Investigational)
              </p>
            </div>
            <div className="ml-auto flex gap-2">
              {[1, 2, 3, 4].map(l => (
                <Badge key={l} className={`text-[9px] ${LEVEL_COLORS[l as 1 | 2 | 3 | 4].bg} ${LEVEL_COLORS[l as 1 | 2 | 3 | 4].text}`}>
                  L{l}: {scores.filter(s => s.level === l).length}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        {/* Evidence Score Chart */}
        <Card className="border-stone-200 col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Evidence Scores by Biomarker</CardTitle>
            <CardDescription className="text-xs">Composite score (0-100) based on regulatory, clinical, diagnostic, and guideline evidence</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis type="number" tick={{ fontSize: 10 }} domain={[0, 100]} />
                <YAxis dataKey="biomarker" type="category" tick={{ fontSize: 10 }} width={70} />
                <RechartsTooltip content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border border-stone-200 rounded p-2 shadow text-xs">
                        <p className="font-medium">{d.biomarker}</p>
                        <p>Score: {d.score}/100</p>
                        <p>Level: {d.level} ({LEVEL_LABELS[d.level as 1 | 2 | 3 | 4]})</p>
                      </div>
                    );
                  }
                  return null;
                }} />
                <Bar dataKey="score" radius={[0, 3, 3, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={LEVEL_COLORS[entry.level as 1 | 2 | 3 | 4].fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Level Distribution */}
        <Card className="border-stone-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Evidence Level Distribution</CardTitle>
            <CardDescription className="text-xs">Biomarkers by maturity tier</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 pt-2">
              {levelDist.map((l, i) => {
                const LevelIcon = LEVEL_ICONS[(i + 1) as 1 | 2 | 3 | 4];
                return (
                  <div key={l.level} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <LevelIcon className="w-4 h-4" style={{ color: l.color }} />
                        <span className="text-xs font-medium">{l.level}</span>
                      </div>
                      <span className="text-xs font-bold">{l.count}</span>
                    </div>
                    <p className="text-[10px] text-stone-500">{l.label}</p>
                    <Progress value={(l.count / Math.max(scores.length, 1)) * 100} className="h-2" />
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-6 p-3 bg-stone-50 rounded-lg">
              <p className="text-[10px] font-semibold text-stone-600 mb-2">SCORING COMPONENTS</p>
              <div className="space-y-1 text-[10px] text-stone-500">
                <p>Regulatory (30%): FDA CDx approval</p>
                <p>Clinical (25%): Phase 3 evidence</p>
                <p>Emerging (15%): Phase 2 + recruiting</p>
                <p>Diagnostic (15%): Assay availability</p>
                <p>Guidelines (15%): NCCN/ESMO inclusion</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Evidence Cards */}
      <Card className="border-stone-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Detailed Evidence Assessment</CardTitle>
          <CardDescription className="text-xs">Per-biomarker evidence breakdown with clinical actionability for {indication}</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <div className="space-y-3">
              {scores.map((score, i) => {
                const colors = LEVEL_COLORS[score.level];
                const LevelIcon = LEVEL_ICONS[score.level];
                return (
                  <div key={i} className={`p-4 rounded-lg border-2 ${colors.border} ${colors.bg}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <LevelIcon className={`w-5 h-5 ${colors.text}`} />
                        <Badge variant="outline" className={`text-xs font-bold ${colors.text} ${colors.border}`}>{score.biomarker}</Badge>
                        <Badge className={`text-[10px] ${colors.bg} ${colors.text}`}>Level {score.level}: {score.levelLabel}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold" style={{ color: colors.fill }}>{score.overallScore}</span>
                        <span className="text-[10px] text-stone-500">/100</span>
                      </div>
                    </div>

                    {/* Component Bars */}
                    <div className="grid grid-cols-5 gap-2 mb-3">
                      {Object.entries(score.components).map(([key, val]) => (
                        <div key={key} className="text-center">
                          <div className="h-16 bg-white/50 rounded relative overflow-hidden">
                            <div
                              className="absolute bottom-0 w-full rounded transition-all"
                              style={{
                                height: `${val}%`,
                                backgroundColor: val >= 80 ? '#22c55e' : val >= 50 ? '#eab308' : val >= 20 ? '#f97316' : '#ef4444',
                              }}
                            />
                          </div>
                          <p className="text-[9px] text-stone-600 mt-1 capitalize">{key}</p>
                          <p className="text-[10px] font-bold">{val}%</p>
                        </div>
                      ))}
                    </div>

                    {/* Badges */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {score.fdaCdxApproved && (
                        <Badge className="bg-emerald-600 text-white text-[9px]">
                          <CheckCircle2 className="w-3 h-3 mr-0.5" /> FDA CDx
                        </Badge>
                      )}
                      {score.guidelineInclusion && (
                        <Badge className="bg-sky-600 text-white text-[9px]">
                          <Star className="w-3 h-3 mr-0.5" /> NCCN/ESMO
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[9px]">{score.totalTrials} trials</Badge>
                      {score.phase3Completed > 0 && (
                        <Badge variant="outline" className="text-[9px]">{score.phase3Completed} Ph3 completed</Badge>
                      )}
                      {score.phase3Recruiting > 0 && (
                        <Badge variant="outline" className="text-[9px] text-emerald-600">{score.phase3Recruiting} Ph3 recruiting</Badge>
                      )}
                      {score.recruitingTrials > 0 && (
                        <Badge variant="outline" className="text-[9px]">{score.recruitingTrials} active</Badge>
                      )}
                    </div>

                    {/* Summary */}
                    <p className="text-[11px] text-stone-600 mb-2">{score.summary}</p>

                    {/* Actionability */}
                    <div className="p-2 bg-white/60 rounded border border-white/80">
                      <p className="text-[10px] font-semibold text-stone-700 mb-0.5">Clinical Actionability:</p>
                      <p className="text-[11px] text-stone-600 leading-relaxed">{score.actionability}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
