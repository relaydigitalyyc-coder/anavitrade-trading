import { Link } from "wouter";
import { Plus, Power, RefreshCw, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/**
 * Per-user "Connected Exchanges" dashboard panel. Lists each active CEX
 * connection with live balance, copytrade status, per-connection kill switch,
 * and revoke. Replaces the legacy singleton env-based Binance panel.
 */
export default function ConnectedExchangesPanel() {
  const utils = trpc.useUtils();
  const { data: connections, isLoading } = trpc.cex.getConnections.useQuery();

  const toggleKill = trpc.cex.toggleKillSwitch.useMutation({
    onSuccess: () => utils.cex.getConnections.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const revoke = trpc.cex.revoke.useMutation({
    onSuccess: () => { toast.success("Exchange disconnected"); utils.cex.getConnections.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const validate = trpc.cex.validate.useMutation({
    onSuccess: () => { toast.success("Balance refreshed"); utils.cex.getConnections.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const active = (connections ?? []).filter((c) => c.status === "active");

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid oklch(1 0 0 / 0.06)" }}>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4" style={{ color: "oklch(0.72 0.20 195)" }} />
          <h3 className="font-heading font-medium text-foreground">Connected Exchanges</h3>
        </div>
        <Link href="/onboarding/exchange">
          <button className="btn-hairline h-9 px-4 text-[0.82rem]">
            <Plus className="w-3.5 h-3.5" /> Connect
          </button>
        </Link>
      </div>

      <div className="p-5">
        {isLoading ? (
          <div className="text-sm text-white/40 py-6 text-center">Loading connections…</div>
        ) : active.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-white/50 mb-4">No exchanges connected yet.</p>
            <Link href="/onboarding/exchange">
              <button
                className="h-11 px-6 rounded-[100px] text-[0.9rem] font-medium inline-flex items-center gap-2 transition-transform active:scale-[0.98]"
                style={{ fontFamily: "var(--font-heading)", color: "oklch(0.14 0.02 255)", background: "var(--grad-arctic)" }}
              >
                <Plus className="w-4 h-4" /> Connect an exchange
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((c) => (
              <div key={c.id} className="rounded-xl p-4" style={{ background: "oklch(1 0 0 / 0.03)", border: "1px solid oklch(1 0 0 / 0.06)" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg inline-flex items-center justify-center font-heading font-bold text-xs"
                      style={{ background: "var(--grad-arctic)", color: "oklch(0.14 0.02 255)" }}>
                      {c.label?.slice(0, 1) ?? c.exchange.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-foreground capitalize">{c.label ?? c.exchange}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.killSwitchActive ? "oklch(0.76 0.16 75)" : "oklch(0.78 0.19 155)" }} />
                        <span className="text-[0.7rem]" style={{ color: "oklch(0.6 0.02 240)" }}>
                          {c.killSwitchActive ? "Paused" : "Copytrade live"}
                          {c.withdrawalDisabledVerified ? " · trade-only ✓" : c.attested ? " · attested" : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm text-foreground">
                      ${Number(c.lastBalanceUsd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[0.65rem]" style={{ color: "oklch(0.5 0.02 240)" }}>balance</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => toggleKill.mutate({ exchange: c.exchange, active: !c.killSwitchActive })}
                    className="flex-1 h-8 rounded-lg text-[0.78rem] font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                    style={c.killSwitchActive
                      ? { background: "oklch(0.78 0.19 155 / 0.12)", color: "oklch(0.78 0.19 155)" }
                      : { background: "oklch(0.76 0.16 75 / 0.1)", color: "oklch(0.76 0.16 75)" }}
                  >
                    <Power className="w-3.5 h-3.5" />
                    {c.killSwitchActive ? "Resume" : "Kill switch"}
                  </button>
                  <button
                    onClick={() => validate.mutate({ exchange: c.exchange })}
                    className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
                    style={{ background: "oklch(1 0 0 / 0.04)" }}
                    title="Refresh balance"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${validate.isPending ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    onClick={() => revoke.mutate({ exchange: c.exchange })}
                    className="h-8 w-8 rounded-lg inline-flex items-center justify-center transition-colors"
                    style={{ background: "oklch(0.65 0.22 25 / 0.1)", color: "oklch(0.65 0.22 25)" }}
                    title="Disconnect"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
