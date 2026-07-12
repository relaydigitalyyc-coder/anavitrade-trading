import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";

const SIGNALS_PER_PAGE = 20;

export function useSignalFeed() {
  const [tierFilter, setTierFilter] = useState<"all" | "A" | "B" | "C">("all");
  const [signalPeriod, setSignalPeriod] = useState<string>("all");
  const [signalPage, setSignalPage] = useState(0);
  const [sortBy, setSortBy] = useState<"quality" | "date">("quality");

  const { data: signalsData, isLoading: signalsLoading, refetch: refetchSignals } = trpc.signals.list.useQuery({
    page: signalPage,
    limit: SIGNALS_PER_PAGE,
    tier: tierFilter,
    period: signalPeriod === "all" ? undefined : signalPeriod,
    sortBy,
  });

  const allSignals = signalsData?.signals ?? [];
  const signalsTotal = signalsData?.total ?? 0;
  const signalsMaxPage = Math.max(0, Math.ceil(signalsTotal / SIGNALS_PER_PAGE) - 1);

  // Top 3 winners (Buy + biggest 24h gain) across current page
  const topWinners = useMemo(() => {
    return [...allSignals]
      .filter(s => s.signal === 1 && s.percentage24 != null && parseFloat(String(s.percentage24)) >= 3)
      .sort((a, b) => parseFloat(String(b.percentage24)) - parseFloat(String(a.percentage24)))
      .slice(0, 3);
  }, [allSignals]);

  // Map signalId → rank (1-3) for gold row highlighting
  const winnerRankMap = useMemo(() => {
    const map = new Map<number, number>();
    topWinners.forEach((s, i) => map.set(s.id, i + 1));
    return map;
  }, [topWinners]);

  const goToPage = (page: number) => setSignalPage(page);

  return {
    tierFilter, setTierFilter,
    signalPeriod, setSignalPeriod,
    signalPage, setSignalPage,
    sortBy, setSortBy,
    signals: allSignals,
    signalsLoading,
    signalsTotal,
    signalsMaxPage,
    topWinners,
    winnerRankMap,
    refetchSignals,
    goToPage,
    SIGNALS_PER_PAGE,
  };
}
