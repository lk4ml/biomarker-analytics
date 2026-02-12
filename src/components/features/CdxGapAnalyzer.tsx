// Feature 5: Companion Diagnostic (CDx) Gap Analyzer
import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { AlertTriangle, CheckCircle2, XCircle, ArrowRight, Beaker } from 'lucide-react';
import type { TrialBiomarkerUsage, AssayInfo } from '@/types';

interface CdxGapAnalyzerProps {
  trials: TrialBiomarkerUsage[];
  assays: AssayInfo[];
  indication: string;
  biomarkers: string[];
}

interface CdxGap {
  biomarker: string;
  indication: string;
  trialCount: number;
  recruitingCount: number;
  hasFdaCdx: boolean;
  cdxAssays: string[];
  researchAssays: string[];
  gapSeverity: 'Critical' | 'Moderate' | 'Covered';
  gapDescription: string;
  opportunity: string;
  phase3Count: number;
}

export function CdxGapAnalyzer({ trials, assays, indication, biomarkers }: CdxGapAnalyzerProps) {
  const gaps = useMemo((): CdxGap[] => {
    return biomarkers.map(bm => {
      const bmTrials = trials.filter(t => t.biomarkerName === bm);
      if (bmTrials.length === 0) return null;

      const recruitingCount = bmTrials.filter(t => t.status === 'Recruiting' || t.status === 'Active').length;
      const phase3Count = bmTrials.filter(t => t.phase.includes('3')).length;

      // Check for FDA-approved CDx
      const bmAssays = assays.filter(a => a.biomarkers.includes(bm));
      const fdaCdxAssays = bmAssays.filter(a => a.fdaApproved && a.companionDiagnosticFor.length > 0);
      const researchAssays = bmAssays.filter(a => !a.fdaApproved);

      // Check if CDx covers this specific indication
      const cdxForIndication = fdaCdxAssays.filter(a =>
        a.companionDiagnosticFor.some(ind =>
          ind.toLowerCase().includes(indication.toLowerCase()) ||
          ind.toLowerCase().includes(indication.split(' ')[0].toLowerCase())
        )
      );

      const hasFdaCdx = cdxForIndication.length > 0;
      const hasAnyFdaCdx = fdaCdxAssays.length > 0;

      let gapSeverity: CdxGap['gapSeverity'];
      let gapDescription: string;
      let opportunity: string;

      if (hasFdaCdx) {
        gapSeverity = 'Covered';
        gapDescription = `FDA-approved CDx exists: ${cdxForIndication.map(a => a.name).join(', ')}`;
        opportunity = 'Market is covered. Opportunity for next-gen assays with better performance, lower turnaround time, or multi-biomarker panels.';
      } else if (hasAnyFdaCdx && !hasFdaCdx) {
        gapSeverity = 'Moderate';
        gapDescription = `FDA CDx exists for ${bm} in other indications but NOT specifically approved for ${indication}. ${fdaCdxAssays.map(a => a.name).join(', ')} may be used off-label.`;
        opportunity = `Label expansion opportunity: ${fdaCdxAssays.map(a => a.name).join(', ')} could seek indication-specific CDx approval for ${indication}. ${phase3Count} Phase 3 trials could support regulatory submission.`;
      } else {
        gapSeverity = 'Critical';
        gapDescription = `No FDA-approved CDx for ${bm}. ${bmTrials.length} trials require ${bm} testing but rely on local lab testing or research-use assays.`;
        opportunity = `Major diagnostic development opportunity: ${recruitingCount} recruiting trials need standardized ${bm} testing. CDx development aligned with Phase 3 trials could enable co-approval.`;
      }

      return {
        biomarker: bm,
        indication,
        trialCount: bmTrials.length,
        recruitingCount,
        hasFdaCdx,
        cdxAssays: fdaCdxAssays.map(a => a.name),
        researchAssays: researchAssays.map(a => a.name),
        gapSeverity,
        gapDescription,
        opportunity,
        phase3Count,
      };
    }).filter((g): g is CdxGap => g !== null);
  }, [trials, assays, indication, biomarkers]);

  // Summary stats
  const criticalGaps = gaps.filter(g => g.gapSeverity === 'Critical').length;
  const moderateGaps = gaps.filter(g => g.gapSeverity === 'Moderate').length;
  const covered = gaps.filter(g => g.gapSeverity === 'Covered').length;

  // Chart data
  const chartData = gaps.map(g => ({
    biomarker: g.biomarker,
    'With CDx': g.hasFdaCdx ? g.trialCount : 0,
    'Without CDx': g.hasFdaCdx ? 0 : g.trialCount,
    'Research Only': !g.hasFdaCdx && g.researchAssays.length > 0 ? g.trialCount : 0,
  }));

  // Platform gap analysis
  const platformGaps = useMemo(() => {
    const platforms = new Map<string, { covered: number; uncovered: number; total: number }>();
    assays.forEach(a => {
      if (!platforms.has(a.platform)) {
        platforms.set(a.platform, { covered: 0, uncovered: 0, total: 0 });
      }
      const entry = platforms.get(a.platform)!;
      entry.total++;
      if (a.fdaApproved) entry.covered++;
      else entry.uncovered++;
    });
    return Array.from(platforms.entries()).map(([platform, data]) => ({
      platform,
      ...data,
    }));
  }, [assays]);

  return (
    <div className="space-y-4">
      {/* Summary Banner */}
      <div className="grid grid-cols-3 gap-3">
        <Card className={`border-2 ${criticalGaps > 0 ? 'border-red-300 bg-red-50' : 'border-stone-200'}`}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <XCircle className={`w-6 h-6 ${criticalGaps > 0 ? 'text-red-600' : 'text-stone-300'}`} />
              <div>
                <p className="text-2xl font-bold text-red-700">{criticalGaps}</p>
                <p className="text-[10px] text-red-600">Critical Gaps (No CDx)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-2 ${moderateGaps > 0 ? 'border-amber-300 bg-amber-50' : 'border-stone-200'}`}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`w-6 h-6 ${moderateGaps > 0 ? 'text-amber-600' : 'text-stone-300'}`} />
              <div>
                <p className="text-2xl font-bold text-amber-700">{moderateGaps}</p>
                <p className="text-[10px] text-amber-600">Moderate Gaps (Off-label CDx)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-2 border-emerald-300 bg-emerald-50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              <div>
                <p className="text-2xl font-bold text-emerald-700">{covered}</p>
                <p className="text-[10px] text-emerald-600">Fully Covered</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* CDx Coverage Chart */}
        <Card className="border-stone-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">CDx Coverage by Biomarker — {indication}</CardTitle>
            <CardDescription className="text-xs">Trials with vs. without FDA-approved companion diagnostics</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="biomarker" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <RechartsTooltip contentStyle={{ fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="With CDx" fill="#22c55e" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Without CDx" fill="#ef4444" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Research Only" fill="#eab308" stackId="a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Platform Analysis */}
        <Card className="border-stone-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Assay Platform Distribution</CardTitle>
            <CardDescription className="text-xs">FDA-approved vs. research-use assays by platform type</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={platformGaps}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="platform" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <RechartsTooltip contentStyle={{ fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="covered" name="FDA Approved" fill="#22c55e" radius={[0, 0, 0, 0]} />
                <Bar dataKey="uncovered" name="Research Use" fill="#94a3b8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Gap Cards */}
      <Card className="border-stone-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Detailed CDx Gap Analysis — {indication}</CardTitle>
          <CardDescription className="text-xs">Biomarker-by-biomarker diagnostic coverage assessment with development opportunities</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <div className="space-y-3">
              {gaps.sort((a, b) => {
                const order = { 'Critical': 0, 'Moderate': 1, 'Covered': 2 };
                return order[a.gapSeverity] - order[b.gapSeverity];
              }).map((gap, i) => (
                <div key={i} className={`p-4 rounded-lg border-2 ${
                  gap.gapSeverity === 'Critical' ? 'border-red-200 bg-red-50/50' :
                  gap.gapSeverity === 'Moderate' ? 'border-amber-200 bg-amber-50/50' :
                  'border-emerald-200 bg-emerald-50/50'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs font-bold">{gap.biomarker}</Badge>
                      <Badge className={`text-[10px] ${
                        gap.gapSeverity === 'Critical' ? 'bg-red-600 text-white' :
                        gap.gapSeverity === 'Moderate' ? 'bg-amber-500 text-white' :
                        'bg-emerald-600 text-white'
                      }`}>
                        {gap.gapSeverity === 'Critical' ? <XCircle className="w-3 h-3 mr-0.5 inline" /> :
                         gap.gapSeverity === 'Moderate' ? <AlertTriangle className="w-3 h-3 mr-0.5 inline" /> :
                         <CheckCircle2 className="w-3 h-3 mr-0.5 inline" />}
                        {gap.gapSeverity}
                      </Badge>
                    </div>
                    <div className="flex gap-2 text-[10px] text-stone-500">
                      <span>{gap.trialCount} trials</span>
                      <span>{gap.recruitingCount} recruiting</span>
                      <span>{gap.phase3Count} Phase 3</span>
                    </div>
                  </div>

                  <p className="text-xs text-stone-700 mb-2">{gap.gapDescription}</p>

                  {gap.cdxAssays.length > 0 && (
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <div className="flex flex-wrap gap-1">
                        {gap.cdxAssays.map(a => (
                          <Badge key={a} className="bg-emerald-100 text-emerald-700 text-[9px]">{a}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {gap.researchAssays.length > 0 && (
                    <div className="flex items-center gap-2 mb-2">
                      <Beaker className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <div className="flex flex-wrap gap-1">
                        {gap.researchAssays.map(a => (
                          <Badge key={a} variant="outline" className="text-[9px]">{a}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Opportunity */}
                  <div className="mt-2 p-2 bg-white/60 rounded border border-stone-200">
                    <div className="flex items-start gap-1.5">
                      <ArrowRight className="w-3.5 h-3.5 text-sky-600 mt-0.5 shrink-0" />
                      <p className="text-[11px] text-sky-800 leading-relaxed">{gap.opportunity}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
