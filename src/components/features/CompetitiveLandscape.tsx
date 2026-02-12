// Feature 4: Competitive Landscape / Sponsor Intelligence Tab
import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { Building2, TrendingUp, Target, Loader2 } from 'lucide-react';
import type { TrialBiomarkerUsage } from '@/types';

interface CompetitiveLandscapeProps {
  trials: TrialBiomarkerUsage[];
  indication: string;
  loading?: boolean;
}

const COLORS = ['#0ea5e9', '#f97316', '#22c55e', '#a855f7', '#ef4444', '#eab308', '#06b6d4', '#ec4899', '#14b8a6', '#f59e0b', '#6366f1', '#84cc16'];

export function CompetitiveLandscape({ trials, indication, loading }: CompetitiveLandscapeProps) {
  const [viewBy, setViewBy] = useState<'sponsor' | 'biomarker' | 'phase'>('sponsor');

  // Sponsor analysis
  const sponsorData = useMemo(() => {
    const map = new Map<string, {
      name: string;
      total: number;
      recruiting: number;
      completed: number;
      phases: Record<string, number>;
      biomarkers: Record<string, number>;
    }>();

    trials.forEach(t => {
      if (!map.has(t.sponsor)) {
        map.set(t.sponsor, {
          name: t.sponsor,
          total: 0,
          recruiting: 0,
          completed: 0,
          phases: {},
          biomarkers: {},
        });
      }
      const entry = map.get(t.sponsor)!;
      entry.total++;
      if (t.status === 'Recruiting' || t.status === 'Active') entry.recruiting++;
      if (t.status === 'Completed') entry.completed++;
      entry.phases[t.phase] = (entry.phases[t.phase] || 0) + 1;
      entry.biomarkers[t.biomarkerName] = (entry.biomarkers[t.biomarkerName] || 0) + 1;
    });

    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [trials]);

  // Pipeline heatmap: sponsor × biomarker
  const heatmapData = useMemo(() => {
    const biomarkers = [...new Set(trials.map(t => t.biomarkerName))];
    const topSponsors = sponsorData.slice(0, 10);

    return topSponsors.map(s => {
      const row: Record<string, string | number> = { sponsor: s.name.length > 20 ? s.name.slice(0, 20) + '...' : s.name, fullName: s.name };
      biomarkers.forEach(bm => {
        row[bm] = trials.filter(t => t.sponsor === s.name && t.biomarkerName === bm).length;
      });
      return row;
    });
  }, [trials, sponsorData]);

  // Phase distribution per sponsor
  const phaseData = useMemo(() => {
    return sponsorData.slice(0, 10).map(s => ({
      name: s.name.length > 18 ? s.name.slice(0, 18) + '...' : s.name,
      fullName: s.name,
      'Phase 1': s.phases['Phase 1'] || 0,
      'Phase 2': s.phases['Phase 2'] || 0,
      'Phase 3': s.phases['Phase 3'] || 0,
      'Phase 2/3': (s.phases['Phase 2/3'] || 0),
    }));
  }, [sponsorData]);

  // White space analysis: biomarkers with few sponsors
  const whiteSpaceData = useMemo(() => {
    const bmSponsorMap = new Map<string, Set<string>>();
    trials.forEach(t => {
      if (!bmSponsorMap.has(t.biomarkerName)) {
        bmSponsorMap.set(t.biomarkerName, new Set());
      }
      bmSponsorMap.get(t.biomarkerName)!.add(t.sponsor);
    });

    return Array.from(bmSponsorMap.entries())
      .map(([biomarker, sponsors]) => ({
        biomarker,
        sponsors: sponsors.size,
        trials: trials.filter(t => t.biomarkerName === biomarker).length,
        competitiveness: sponsors.size > 5 ? 'High' : sponsors.size > 2 ? 'Medium' : 'Low',
      }))
      .sort((a, b) => a.sponsors - b.sponsors);
  }, [trials]);

  // Biomarker distribution pie
  const biomarkerPie = useMemo(() => {
    const counts = new Map<string, number>();
    trials.forEach(t => {
      counts.set(t.biomarkerName, (counts.get(t.biomarkerName) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [trials]);

  const uniqueBiomarkers = [...new Set(trials.map(t => t.biomarkerName))];

  if (loading) {
    return (
      <Card className="border-stone-200">
        <CardContent className="py-16 text-center">
          <Loader2 className="w-8 h-8 text-sky-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-stone-500">Loading competitive intelligence data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-stone-200">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-sky-600" />
              <div>
                <p className="text-xl font-bold">{sponsorData.length}</p>
                <p className="text-[10px] text-stone-500">Active Sponsors</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-xl font-bold">{trials.filter(t => t.status === 'Recruiting').length}</p>
                <p className="text-[10px] text-stone-500">Recruiting Trials</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-600" />
              <div>
                <p className="text-xl font-bold">{uniqueBiomarkers.length}</p>
                <p className="text-[10px] text-stone-500">Biomarkers Targeted</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-stone-200">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-orange-600" />
              <div>
                <p className="text-xl font-bold">{sponsorData[0]?.name.split(' ')[0] || '-'}</p>
                <p className="text-[10px] text-stone-500">Top Sponsor</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Top Sponsors Bar Chart */}
        <Card className="border-stone-200">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Top Sponsors — {indication}</CardTitle>
                <CardDescription className="text-xs">Companies by trial count in {indication}</CardDescription>
              </div>
              <Select value={viewBy} onValueChange={(v) => setViewBy(v as 'sponsor' | 'biomarker' | 'phase')}>
                <SelectTrigger className="w-28 h-7 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sponsor">By Sponsor</SelectItem>
                  <SelectItem value="biomarker">By Biomarker</SelectItem>
                  <SelectItem value="phase">By Phase</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {viewBy === 'sponsor' && (
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={sponsorData.slice(0, 10).map(s => ({
                  name: s.name.length > 15 ? s.name.slice(0, 15) + '...' : s.name,
                  fullName: s.name,
                  Recruiting: s.recruiting,
                  Completed: s.completed,
                }))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={110} />
                  <RechartsTooltip content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-white border border-stone-200 rounded p-2 shadow text-xs">
                          <p className="font-medium">{d.fullName}</p>
                          <p className="text-emerald-600">Recruiting: {d.Recruiting}</p>
                          <p className="text-stone-500">Completed: {d.Completed}</p>
                        </div>
                      );
                    }
                    return null;
                  }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="Recruiting" fill="#22c55e" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Completed" fill="#94a3b8" stackId="a" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            {viewBy === 'biomarker' && (
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie data={biomarkerPie} cx="50%" cy="50%" outerRadius={120} innerRadius={50} paddingAngle={2} dataKey="value" label={({ name, value }) => `${name} (${value})`} style={{ fontSize: '10px' }}>
                    {biomarkerPie.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
            {viewBy === 'phase' && (
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={phaseData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} width={110} />
                  <RechartsTooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="Phase 1" fill="#eab308" stackId="a" />
                  <Bar dataKey="Phase 2" fill="#0ea5e9" stackId="a" />
                  <Bar dataKey="Phase 2/3" fill="#a855f7" stackId="a" />
                  <Bar dataKey="Phase 3" fill="#22c55e" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* White Space Analysis */}
        <Card className="border-stone-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">White Space Analysis — {indication}</CardTitle>
            <CardDescription className="text-xs">Biomarker opportunity map: fewer sponsors = more white space</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[350px]">
              <div className="space-y-2">
                {whiteSpaceData.map((item, i) => (
                  <div key={i} className="p-3 border border-stone-200 rounded-md hover:border-stone-300 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{item.biomarker}</Badge>
                        <span className="text-xs text-stone-600">{item.trials} trials</span>
                      </div>
                      <Badge
                        className={`text-[10px] ${
                          item.competitiveness === 'Low' ? 'bg-emerald-100 text-emerald-700' :
                          item.competitiveness === 'Medium' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}
                      >
                        {item.competitiveness === 'Low' ? 'Opportunity' :
                         item.competitiveness === 'Medium' ? 'Moderate' : 'Crowded'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-stone-500">{item.sponsors} sponsors</span>
                      <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(item.sponsors * 10, 100)}%`,
                            backgroundColor: item.competitiveness === 'Low' ? '#22c55e' :
                              item.competitiveness === 'Medium' ? '#eab308' : '#ef4444'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Heatmap */}
      <Card className="border-stone-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Pipeline Heatmap: Sponsor × Biomarker</CardTitle>
          <CardDescription className="text-xs">Number of trials per sponsor per biomarker in {indication}</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full">
            <div className="min-w-[600px]">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-2 text-stone-500 font-medium">Sponsor</th>
                    {uniqueBiomarkers.map(bm => (
                      <th key={bm} className="text-center py-2 px-1 text-stone-500 font-medium text-[10px]">{bm}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmapData.map((row, i) => (
                    <tr key={i} className="border-t border-stone-100">
                      <td className="py-1.5 px-2 text-stone-700 font-medium text-[11px]">{row.sponsor as string}</td>
                      {uniqueBiomarkers.map(bm => {
                        const val = (row[bm] as number) || 0;
                        return (
                          <td key={bm} className="text-center py-1.5 px-1">
                            {val > 0 ? (
                              <span
                                className="inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold"
                                style={{
                                  backgroundColor: val >= 3 ? '#0ea5e9' : val >= 2 ? '#7dd3fc' : '#e0f2fe',
                                  color: val >= 3 ? 'white' : val >= 2 ? '#0369a1' : '#0ea5e9',
                                }}
                              >
                                {val}
                              </span>
                            ) : (
                              <span className="text-stone-200">-</span>
                            )}
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
  );
}
