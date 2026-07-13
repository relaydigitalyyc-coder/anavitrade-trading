import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Eye, EyeOff, ShieldCheck, CheckCircle2, KeyRound, Lock } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import ExchangePicker, { type ExchangeOption } from "@/components/ExchangePicker";

type Step = 1 | 2 | 3;

export default function ExchangeOnboarding() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>(1);
  const [exchange, setExchange] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [attest, setAttest] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const { data: exchanges } = trpc.cex.listExchanges.useQuery();
  const utils = trpc.useUtils();

  const meta = useMemo<ExchangeOption | undefined>(
    () => exchanges?.find((e) => e.id === exchange),
    [exchanges, exchange],
  );

  const connect = trpc.cex.connect.useMutation({
    onSuccess: (r) => {
      toast.success("Exchange connected", {
        description: `Balance verified: $${Number((r as any)?.balance?.equityUsd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      });
      utils.cex.getConnections.invalidate();
      navigate("/dashboard");
    },
    onError: (e) => toast.error(e.message),
  });

  const canSubmit =
    !!exchange && apiKey.trim().length >= 8 && apiSecret.trim().length >= 8 &&
    (!meta?.needsPassphrase || passphrase.trim().length > 0) && attest;

  return (
    <DashboardLayout variant="onboarding">
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-10">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "oklch(1 0 0 / 0.06)" }}>
              <motion.div
                className="h-full rounded-full"
                initial={false}
                animate={{ width: step >= n ? "100%" : "0%" }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                style={{ background: "var(--grad-arctic)" }}
              />
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Step 1 — pick exchange */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }}>
              <h1 className="font-heading font-medium text-3xl tracking-[-0.03em] mb-2">Connect your exchange</h1>
              <p className="text-sm mb-8" style={{ color: "oklch(0.68 0.02 240)" }}>
                Pick where you trade. We mirror signals onto your own account with a trade-only key — your funds never leave the exchange.
              </p>
              <ExchangePicker
                exchanges={exchanges ?? []}
                selected={exchange}
                onSelect={(id) => setExchange(id)}
              />
              <div className="flex justify-end mt-8">
                <button
                  disabled={!exchange}
                  onClick={() => setStep(2)}
                  className="btn-hairline h-12 px-7 text-[0.9rem] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 2 — instructions + keys */}
          {step === 2 && meta && (
            <motion.div key="s2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }}>
              <h1 className="font-heading font-medium text-3xl tracking-[-0.03em] mb-2">Create a trade-only key on {meta.label}</h1>
              <p className="text-sm mb-6" style={{ color: "oklch(0.68 0.02 240)" }}>{meta.keyHint}</p>

              <div className="glass-card rounded-2xl p-5 mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="w-4 h-4" style={{ color: "oklch(0.72 0.20 195)" }} />
                  <span className="text-sm font-medium">Enter your API credentials</span>
                </div>

                <label className="block text-xs mb-1.5 mt-3" style={{ color: "oklch(0.6 0.02 240)" }}>API Key</label>
                <input
                  value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste your API key"
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-transparent outline-none font-mono"
                  style={{ border: "1.4px solid oklch(1 0 0 / 0.1)", color: "oklch(0.95 0.006 220)" }}
                />

                <label className="block text-xs mb-1.5 mt-4" style={{ color: "oklch(0.6 0.02 240)" }}>API Secret</label>
                <div className="relative">
                  <input
                    type={showSecret ? "text" : "password"}
                    value={apiSecret} onChange={(e) => setApiSecret(e.target.value)}
                    placeholder="Paste your API secret"
                    className="w-full rounded-xl px-3.5 py-2.5 pr-10 text-sm bg-transparent outline-none font-mono"
                    style={{ border: "1.4px solid oklch(1 0 0 / 0.1)", color: "oklch(0.95 0.006 220)" }}
                  />
                  <button type="button" onClick={() => setShowSecret((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {meta.needsPassphrase && (
                  <>
                    <label className="block text-xs mb-1.5 mt-4" style={{ color: "oklch(0.6 0.02 240)" }}>API Passphrase</label>
                    <input
                      type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)}
                      placeholder="Your API passphrase"
                      className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-transparent outline-none font-mono"
                      style={{ border: "1.4px solid oklch(1 0 0 / 0.1)", color: "oklch(0.95 0.006 220)" }}
                    />
                  </>
                )}
              </div>

              {/* Trade-only attestation */}
              <button
                type="button"
                onClick={() => setAttest((a) => !a)}
                className="w-full flex items-start gap-3 rounded-2xl p-4 text-left transition-colors"
                style={{ border: `1.4px solid ${attest ? "oklch(0.72 0.20 195 / 0.5)" : "oklch(1 0 0 / 0.1)"}`, background: attest ? "oklch(0.72 0.20 195 / 0.06)" : "transparent" }}
              >
                <span className="mt-0.5 w-5 h-5 rounded-md inline-flex items-center justify-center flex-shrink-0"
                  style={{ background: attest ? "oklch(0.72 0.20 195)" : "transparent", border: attest ? "none" : "1.4px solid oklch(1 0 0 / 0.2)" }}>
                  {attest && <CheckCircle2 className="w-4 h-4" style={{ color: "oklch(0.1 0.02 255)" }} />}
                </span>
                <span className="text-xs leading-relaxed" style={{ color: "oklch(0.72 0.02 240)" }}>
                  I confirm this key has <span className="text-foreground font-medium">withdrawals disabled</span> and only permits trading.
                  {meta.canVerifyPermissions ? " We'll also verify this automatically." : " We can't verify this on " + meta.label + " — your confirmation is required."}
                </span>
              </button>

              <div className="flex justify-between mt-8">
                <button onClick={() => setStep(1)} className="btn-obsidian h-12 px-6 text-[0.9rem]">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  disabled={!canSubmit || connect.isPending}
                  onClick={() => {
                    setStep(3);
                    connect.mutate({
                      exchange: exchange!, apiKey: apiKey.trim(), apiSecret: apiSecret.trim(),
                      passphrase: passphrase.trim() || undefined, attestTradeOnly: attest,
                    });
                  }}
                  className="h-12 px-7 rounded-[100px] text-[0.9rem] font-medium inline-flex items-center gap-2 transition-transform active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ fontFamily: "var(--font-heading)", color: "oklch(0.14 0.02 255)", background: "var(--grad-arctic)" }}
                >
                  Connect & Verify <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 3 — connecting / result */}
          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }} className="text-center py-10">
              {connect.isPending ? (
                <>
                  <div className="w-14 h-14 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-6" style={{ borderColor: "oklch(0.72 0.20 195)", borderTopColor: "transparent" }} />
                  <h2 className="font-heading font-medium text-2xl tracking-[-0.03em] mb-2">Verifying with {meta?.label}…</h2>
                  <p className="text-sm" style={{ color: "oklch(0.6 0.02 240)" }}>Reading your balance and checking the key is trade-only.</p>
                </>
              ) : connect.isError ? (
                <>
                  <KeyRound className="w-12 h-12 mx-auto mb-5" style={{ color: "oklch(0.65 0.22 25)" }} />
                  <h2 className="font-heading font-medium text-2xl tracking-[-0.03em] mb-2">Couldn't connect</h2>
                  <p className="text-sm mb-6 max-w-sm mx-auto" style={{ color: "oklch(0.68 0.02 240)" }}>{connect.error?.message}</p>
                  <button onClick={() => setStep(2)} className="btn-hairline h-12 px-7 text-[0.9rem]">Try again</button>
                </>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-10 text-center">
          <Link href="/dashboard" className="text-xs hover:underline" style={{ color: "oklch(0.5 0.02 240)" }}>Skip for now</Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
