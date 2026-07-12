import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  BarChart3,
  TrendingUp,
  Zap,
  Target,
  Clock,
  Award,
  ChevronRight,
  Info,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  gold,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  gold?: boolean;
}) {
  return (
    <Card
      className={`relative overflow-hidden border ${
        gold
          ? "border-gold-30 bg-gradient-to-br from-gold-10 to-card"
          : "border-border bg-card"
      }`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p
              className={`text-2xl font-bold tabular-nums ${
                gold ? "text-gold" : "text-white"
              }`}
            >
              {value}
            </p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div
            className={`p-2 rounded-lg ${
              gold ? "bg-gold-20" : "bg-secondary"
            }`}
          >
            <Icon
              className={`w-5 h-5 ${gold ? "text-gold" : "text-primary"}`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Rule card ──────────────────────────────────────────────────────────────────
function RuleCard({
  number,
  title,
  description,
  color,
  data,
}: {
  number: string;
  title: string;
  description: string;
  color: string;
  data: string;
}) {
  return (
    <div
      className="relative rounded-xl border p-5 bg-card transition-all hover:border-opacity-80"
      style={{ borderColor: `${color}40` }}
    >
      <div className="flex items-start gap-4">
        <div
          className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {number}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-white text-sm">{title}</h3>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-2">{description}</p>
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium"
            style={{ backgroundColor: `${color}15`, color }}
          >
            <BarChart3 className="w-3 h-3" />
            {data}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HistoricalPerformance() {
  const { data: statusData } = trpc.signals.scraperStatus.useQuery();
  const { data: perf } = trpc.signals.performance.useQuery();

  // Derived live values with fallbacks
  const totalSignals = perf?.totalSignals?.toLocaleString() ?? "...";
  const medianMaxProfit = perf?.medianMaxProfit != null ? `${perf.medianMaxProfit.toFixed(1)}%` : "...";
  const fourHMedian = perf?.fourHMedian != null ? `${perf.fourHMedian.toFixed(1)}%` : "...";
  const confluenceMedian = perf?.confluenceMedian != null ? `${perf.confluenceMedian.toFixed(1)}%` : "...";

  // Outcome-validated breakdowns
  const byTf = perf?.byTimeframe ?? {};
  const byInd = perf?.byIndicator ?? {};
  const indicatorNames = Object.keys(byInd).sort(
    (a, b) => parseFloat(byInd[b].avgPnl) - parseFloat(byInd[a].avgPnl),
  );
  const maxIndAvgPnl = indicatorNames.length > 0
    ? Math.max(...indicatorNames.map((n) => parseFloat(byInd[n].avgPnl)), 100)
    : 130;
  const topTwoInd = new Set(indicatorNames.slice(0, 2));
  const lastRun = perf?.lastScraperRun;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-8 max-w-6xl mx-auto">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <span>Dashboard</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-white">Historical Performance</span>
          </div>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Historical Performance</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Signal analysis based on {totalSignals} top-performing signals{perf?.validationStatus === "unvalidated" ? " (outcomes unvalidated)" : ""} — April 1 to July 5, 2026
              </p>
            </div>
            <Badge
              variant="outline"
              className="border-primary/40 text-primary bg-primary/10 text-xs"
            >
              Live data from coinlegs.com
            </Badge>
          </div>
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={BarChart3}
            label="Signals Analyzed"
            value={totalSignals}
            sub={`Tier A: ${perf?.tierA ?? "..."} · B: ${perf?.tierB ?? "..."} · C: ${perf?.tierC ?? "..."}`}
          />
          <StatCard
            icon={TrendingUp}
            label="Median MaxProfit"
            value={medianMaxProfit}
            sub="Across all timeframes"
            gold
          />
          <StatCard
            icon={Zap}
            label="4h Median Profit"
            value={fourHMedian}
            sub={`n=${byTf["4h"]?.count?.toLocaleString() ?? "..."} signals`}
            gold
          />
          <StatCard
            icon={Award}
            label="Best 3-Indicator"
            value={confluenceMedian}
            sub="Median with confluence"
            gold
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-border bg-card overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Signal Performance Analysis
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Timeframe, indicator, momentum, and confluence breakdowns
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <img
                src="/manus-storage/historical_analysis_bc4b9b2c.png"
                alt="Historical signal analysis charts"
                className="w-full rounded-b-xl"
              />
            </CardContent>
          </Card>

          <Card className="border-border bg-card overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-gold" />
                Data-Derived Algo Rules
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Rules derived from empirical analysis — no arbitrary weights
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <img
                src="/manus-storage/algo_rules_aed086ed.png"
                alt="Algo rules derived from historical data"
                className="w-full rounded-b-xl"
              />
            </CardContent>
          </Card>
        </div>

        {lastRun && (
          <p className="text-xs text-muted-foreground text-center -mt-4">
            Last scraper run: {new Date(lastRun.startedAt).toLocaleString()} &middot;{" "}
            {lastRun.signalsFetched} signals fetched &middot;{" "}
            Tier A: {lastRun.tierA} &middot; Tier B: {lastRun.tierB}
          </p>
        )}

        <Separator className="bg-secondary" />

        {/* Indicator Rankings from live data */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-base font-semibold text-white">Indicator Rankings</h2>
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                Average PnL % per indicator across all timeframes, based on{" "}
                {indicatorNames.length > 0
                  ? `${indicatorNames.reduce((sum, n) => sum + byInd[n].count, 0)} historical signals`
                  : "..."}{" "}
                ({perf?.validationStatus === "unvalidated" ? "unvalidated — using maxProfit estimates" : "outcome-validated"}).
              </TooltipContent>
            </Tooltip>
          </div>
          <Card className="border-border bg-card p-5">
            <div className="space-y-3">
              {indicatorNames.length > 0 ? (
                indicatorNames.map((name) => {
                  const ind = byInd[name];
                  const avgPnl = parseFloat(ind.avgPnl);
                  const colors: Record<string, string> = {
                    MACD: "oklch(0.82 0.16 85)",
                    Stochastic: "oklch(0.60 0.22 220)",
                    "Trend Reversal": "#3b82f6",
                    CCI: "#8b5cf6",
                    Ichimoku: "#6b7280",
                  };
                  const pal = [
                    "oklch(0.82 0.16 85)",
                    "oklch(0.60 0.22 220)",
                    "#3b82f6",
                    "#8b5cf6",
                    "#6b7280",
                    "#f97316",
                    "#ec4899",
                    "#10b981",
                  ];
                  const color =
                    colors[name] ?? pal[indicatorNames.indexOf(name) % pal.length];
                  const pct = (avgPnl / maxIndAvgPnl) * 100;
                  return (
                    <div key={name} className="flex items-center gap-3">
                      <div className="w-28 text-xs text-right text-muted-foreground flex-shrink-0">
                        {name}
                        {topTwoInd.has(name) && (
                          <span className="ml-1 text-gold">★</span>
                        )}
                      </div>
                      <div className="flex-1 h-6 bg-secondary rounded-md overflow-hidden relative">
                        <div
                          className="h-full rounded-md transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-white">
                          {avgPnl.toFixed(0)}%
                        </span>
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                          n={ind.count} | WR {ind.winRate}%
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-muted-foreground">Loading indicator data...</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              {indicatorNames.length >= 2
                ? `★ ${indicatorNames[0]} and ${indicatorNames[1]} receive a quality bonus in the scoring algorithm.`
                : "★ Top indicators receive a quality bonus in the scoring algorithm."}{" "}
              Bars show average PnL %; win rate (WR) shown per indicator.
            </p>
          </Card>
        </div>

        {/* Algo rules */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-base font-semibold text-white">Algo Selection Rules</h2>
            <Badge variant="outline" className="border-white/10 text-xs text-muted-foreground">
              Applied to every scrape run
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RuleCard
              number="R1"
              title="Timeframe — 4h Preferred"
              description="4h signals have the best risk-adjusted profile: large moves with manageable 4h–3d duration. 4h receives the highest timeframe score in the algo."
              color="oklch(0.82 0.16 85)"
              data={`4h median ${fourHMedian} (n=${byTf["4h"]?.count?.toLocaleString() ?? "..."} signals)`}
            />
            <RuleCard
              number="R2"
              title="Indicator Priority on 4h"
              description="MACD and Stochastic are empirically the strongest indicators on 4h. They receive a quality bonus in scoring. Ichimoku is weakest on 4h — it's better suited to 1w."
              color="oklch(0.60 0.22 220)"
              data={indicatorNames.length > 0
                ? indicatorNames.slice(0, 5).map((n) => `${n} ${parseFloat(byInd[n].avgPnl).toFixed(1)}%`).join(" > ")
                : "MACD 116.3% > Stochastic 110.1% > CCI 97.2%"}
            />
            <RuleCard
              number="R3"
              title="Confluence is the Strongest Edge"
              description={`When 3+ independent indicators fire Buy on the same coin+period simultaneously, the median profit jumps to ${confluenceMedian} — a significant lift over single-indicator signals.`}
              color="#3b82f6"
              data={`3 indicators: ${confluenceMedian} median profit`}
            />
            <RuleCard
              number="R4"
              title="Momentum is a Bonus, Not a Gate"
              description={`Counter-intuitive: negative 24h momentum signals have median ${perf?.negPct24Median?.toFixed(1) ?? "..."}% — nearly identical to positive ones. Pct24 is used as a bonus score only, never as a hard filter.`}
              color="#8b5cf6"
              data={`Negative Pct24 median: ${perf?.negPct24Median?.toFixed(1) ?? "..."}% (not penalized)`}
            />
            <RuleCard
              number="R5"
              title="Profit Speed Determines Tier"
              description="MaxProfit / Duration in hours. 4h P90 = 4.6%/h. Fast movers (>4.6%/h) are ideal for automated execution. Slow signals (>3 days to peak) are better for manual signal delivery."
              color="#f97316"
              data="4h P90 = 4.6%/h | P75 = 2.1%/h | median = 0.8%/h"
            />
            <RuleCard
              number="R6"
              title="Hard Gate: MaxProfit > 0"
              description={`${perf?.rejectedPct?.toFixed(1) ?? "..."}% of Buy signals have MaxProfit = 0 — price never moved after the signal fired. These are definitionally worthless and are rejected before scoring.`}
              color="#ef4444"
              data={`${perf?.rejectedPct?.toFixed(1) ?? "..."}% of all Buy signals rejected at gate (n=${perf?.rejectedCount?.toLocaleString() ?? "..."})`}
            />
          </div>
        </div>

        {/* Scoring breakdown */}
        <div>
          <h2 className="text-base font-semibold text-white mb-4">Scoring System (0–100)</h2>
          <Card className="border-border bg-card">
            <CardContent className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: "A. Realized Outcome", pts: "35 pts", desc: "MaxProfit % — the only objective ground truth", color: "oklch(0.82 0.16 85)" },
                  { label: "B. Profit Speed", pts: "25 pts", desc: "MaxProfit ÷ Duration hours (%/h)", color: "oklch(0.60 0.22 220)" },
                  { label: "C. Confluence", pts: "20 pts", desc: "Distinct indicators agreeing on same coin+period", color: "#3b82f6" },
                  { label: "D. Timeframe", pts: "15 pts", desc: "4h boosted — best risk-adjusted profile", color: "#8b5cf6" },
                  { label: "E. Indicator Quality", pts: "5 pts", desc: "MACD/Stochastic bonus on 4h only", color: "#f97316" },
                  { label: "F. Momentum Bonus", pts: "5 pts", desc: "Pct24 > 10% = +5 pts, > 3% = +3 pts", color: "#ec4899" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-start gap-3 p-3 rounded-lg bg-secondary/60 border border-border"
                  >
                    <div
                      className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: `${item.color}20`, color: item.color }}
                    >
                      {item.pts}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Separator className="bg-secondary my-4" />
              <div className="flex items-center gap-6 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gold" />
                  <span className="text-white font-medium">Tier A</span>
                  <span className="text-muted-foreground">≥ 65 pts</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary" />
                  <span className="text-white font-medium">Tier B</span>
                  <span className="text-muted-foreground">≥ 40 pts</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-muted-foreground" />
                  <span className="text-white font-medium">Tier C</span>
                  <span className="text-muted-foreground">≥ 20 pts</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#374151]" />
                  <span className="text-muted-foreground">Rejected</span>
                  <span className="text-muted-foreground">&lt; 20 pts</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live scraper status */}
        {statusData && (
          <div>
            <h2 className="text-base font-semibold text-white mb-4">Live Scraper Status</h2>
            <Card className="border-border bg-card">
              <CardContent className="p-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Signals in DB</p>
                    <p className="text-xl font-bold text-white tabular-nums">
                      {statusData.totalSignals.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Last Scrape</p>
                    <p className="text-sm font-medium text-white">
                      {statusData.latestRun?.completedAt
                        ? new Date(statusData.latestRun?.completedAt).toLocaleString()
                        : "Never"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Scrape Frequency</p>
                    <p className="text-sm font-medium text-primary flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Every 5 minutes
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Data Source</p>
                    <p className="text-sm font-medium text-white">
                      coinlegs.com · Aster-routable USDT
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
