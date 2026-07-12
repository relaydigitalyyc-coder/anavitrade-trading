import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Key,
  Shield,
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

const ASTER_APP_URL = "https://www.asterdex.com/en/futures";
const ASTER_CODE_DOCS_URL = "https://asterdex.github.io/aster-api-website/asterCode/integration-flow/";

const STEPS = [
  { id: 1, title: "Aster Account", icon: <Wallet className="w-5 h-5" /> },
  { id: 2, title: "Agent Signer", icon: <Key className="w-5 h-5" /> },
  { id: 3, title: "Builder Fee Cap", icon: <Zap className="w-5 h-5" /> },
  { id: 4, title: "Activate", icon: <Shield className="w-5 h-5" /> },
];

export default function AsterOnboarding() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: config } = trpc.aster.getConfig.useQuery();
  const { data: status } = trpc.aster.getStatus.useQuery();
  const [step, setStep] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);
  const [form, setForm] = useState({
    asterAccountAddress: status?.asterAccountAddress ?? "",
    maxFeeRate: status?.maxFeeRate ?? config?.defaultFeeRate ?? "0",
    approvalDays: "30",
    ipWhitelist: "",
  });
  const [confirmations, setConfirmations] = useState({ agentApproved: false, builderApproved: false });

  const prepared = status && status.status !== "missing";
  const active = status?.status === "active";
  const builderConfigured = config?.configured ?? false;

  const approvalExpiresAt = useMemo(() => {
    const days = Number(form.approvalDays || 30);
    if (!Number.isFinite(days) || days <= 0) return undefined;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }, [form.approvalDays]);

  const prepare = trpc.aster.prepareAgent.useMutation({
    onSuccess: () => {
      toast.success("Aster Agent prepared. Approve it in Aster to continue.");
      utils.aster.getStatus.invalidate();
      setStep(2);
    },
    onError: (e) => toast.error(e.message || "Failed to prepare Aster Agent."),
  });

  const recordApprovals = trpc.aster.recordApprovals.useMutation({
    onSuccess: () => {
      toast.success("Aster Agent activated for Anavitrade routing.");
      utils.aster.getStatus.invalidate();
      navigate("/dashboard");
    },
    onError: (e) => toast.error(e.message || "Failed to activate Aster Agent."),
  });

  function copy(value: string, label: string) {
    navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1600);
  }

  function handlePrepare() {
    if (!builderConfigured) {
      toast.error("Aster Builder address is not configured on the backend.");
      return;
    }
    if (!form.asterAccountAddress.trim()) {
      toast.error("Enter your Aster account address.");
      return;
    }
    const ipWhitelist = form.ipWhitelist.split(",").map((item) => item.trim()).filter(Boolean);
    prepare.mutate({
      asterAccountAddress: form.asterAccountAddress.trim(),
      maxFeeRate: form.maxFeeRate.trim() || undefined,
      approvalExpiresAt,
      ipWhitelist: ipWhitelist.length > 0 ? ipWhitelist : undefined,
    });
  }

  function handleActivate() {
    if (!confirmations.agentApproved || !confirmations.builderApproved) {
      toast.error("Confirm both Aster approvals before activating.");
      return;
    }
    recordApprovals.mutate({
      agentApproved: true,
      builderApproved: true,
      maxFeeRate: form.maxFeeRate.trim() || status?.maxFeeRate || undefined,
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/50 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/dashboard">
            <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" /> Dashboard
            </button>
          </Link>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="w-4 h-4 text-primary" /> Aster DEX setup
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-10">
          <h1 className="text-2xl font-heading font-bold text-foreground mb-2">Connect Aster Execution</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Anavitrade routes DEX execution through Aster. You approve one Agent signer for trade execution and one Builder fee cap. No withdrawal permission is requested.
          </p>
        </div>

        <div className="mb-10 flex items-center justify-between">
          {STEPS.map((s, index) => (
            <div key={s.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${step > s.id || active ? "bg-primary border-primary text-primary-foreground" : step === s.id ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"}`}>
                  {step > s.id || active ? <CheckCircle2 className="w-5 h-5" /> : s.icon}
                </div>
                <span className={`text-[10px] font-medium hidden sm:block ${step === s.id ? "text-primary" : "text-muted-foreground"}`}>{s.title}</span>
              </div>
              {index < STEPS.length - 1 && <div className="flex-1 h-px mx-3 mb-5 bg-border" />}
            </div>
          ))}
        </div>

        {active && (
          <div className="mb-8 p-5 rounded-2xl border border-primary/20 bg-primary/5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">Aster execution is active</h3>
                <p className="text-xs text-muted-foreground mt-1">Your Agent and Builder approvals are recorded. Live order submission remains gated until the execution worker is fully wired and verified.</p>
              </div>
            </div>
          </div>
        )}

        <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          {step === 1 && (
            <Panel title="Link your Aster account" subtitle="Use the wallet-controlled account that will hold your margin on Aster.">
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Aster Account Address</label>
                  <input
                    value={form.asterAccountAddress}
                    onChange={(e) => setForm({ ...form, asterAccountAddress: e.target.value })}
                    placeholder="0xYourAsterAccountAddress"
                    className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-sm"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Builder Fee Cap</label>
                    <input
                      value={form.maxFeeRate}
                      onChange={(e) => setForm({ ...form, maxFeeRate: e.target.value })}
                      placeholder="0"
                      className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Approval Duration</label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={form.approvalDays}
                      onChange={(e) => setForm({ ...form, approvalDays: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">IP Whitelist</label>
                  <input
                    value={form.ipWhitelist}
                    onChange={(e) => setForm({ ...form, ipWhitelist: e.target.value })}
                    placeholder="Optional, comma-separated execution IPs"
                    className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Use this once execution runs from a static egress IP. Cloudflare Worker egress is not enough for production IP whitelisting.</p>
                </div>
                {!builderConfigured && (
                  <InfoBox warning>Aster Builder address is missing from backend env. Set `ASTER_BUILDER_ADDRESS` before preparing real Agents.</InfoBox>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  <a href={ASTER_APP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-card transition-all">
                    Open Aster <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button onClick={handlePrepare} disabled={prepare.isPending || !builderConfigured} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-50">
                    {prepare.isPending ? "Preparing..." : "Prepare Agent"} <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Panel>
          )}

          {step === 2 && (
            <Panel title="Approve the Anavitrade Agent" subtitle="This signer can place and cancel Aster perp orders for your account after approval. It must not receive withdrawal permission.">
              <AddressRows status={status} copied={copied} copy={copy} />
              <InfoBox>Approve the Agent signer in Aster with perps enabled, spot disabled unless needed, and withdrawals disabled.</InfoBox>
              <div className="flex items-center gap-3 mt-6">
                <button onClick={() => setStep(1)} className="px-5 py-2.5 rounded-xl border border-border text-foreground text-sm hover:bg-card transition-all">Back</button>
                <button onClick={() => setStep(3)} disabled={!prepared} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-50">Continue</button>
              </div>
            </Panel>
          )}

          {step === 3 && (
            <Panel title="Approve the Builder fee cap" subtitle="This approval lets Aster attribute eligible orders to Anavitrade's Builder address. It is not the full 2-and-20 fee ledger.">
              <AddressRows status={status} copied={copied} copy={copy} />
              <InfoBox warning>The 2% management fee and 20% performance fee stay in Anavitrade's fee ledger. Aster Builder fee rate is an execution-layer fee cap only.</InfoBox>
              <a href={ASTER_CODE_DOCS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-5 text-xs text-primary hover:underline">
                Aster Code approval docs <ExternalLink className="w-3 h-3" />
              </a>
              <div className="flex items-center gap-3 mt-6">
                <button onClick={() => setStep(2)} className="px-5 py-2.5 rounded-xl border border-border text-foreground text-sm hover:bg-card transition-all">Back</button>
                <button onClick={() => setStep(4)} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all">Continue</button>
              </div>
            </Panel>
          )}

          {step === 4 && (
            <Panel title="Record approvals" subtitle="After signing both approvals in Aster, confirm them here so Anavitrade can mark the Agent active.">
              <div className="space-y-3 mb-6">
                <ConfirmRow checked={confirmations.agentApproved} onChange={() => setConfirmations({ ...confirmations, agentApproved: !confirmations.agentApproved })} label="I approved the Agent signer for Aster perp execution." />
                <ConfirmRow checked={confirmations.builderApproved} onChange={() => setConfirmations({ ...confirmations, builderApproved: !confirmations.builderApproved })} label="I approved the Anavitrade Builder fee cap on Aster." />
              </div>
              <InfoBox warning>Foundation mode records the user's confirmation. Production should verify approvals against Aster before activation.</InfoBox>
              <div className="flex items-center gap-3 mt-6">
                <button onClick={() => setStep(3)} className="px-5 py-2.5 rounded-xl border border-border text-foreground text-sm hover:bg-card transition-all">Back</button>
                <button onClick={handleActivate} disabled={recordApprovals.isPending || !confirmations.agentApproved || !confirmations.builderApproved} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-50">
                  {recordApprovals.isPending ? "Activating..." : "Activate Aster Execution"}
                </button>
              </div>
            </Panel>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-heading font-bold text-foreground mb-2">{title}</h2>
      <p className="text-muted-foreground mb-8 leading-relaxed">{subtitle}</p>
      {children}
    </div>
  );
}

function AddressRows({ status, copied, copy }: { status: any; copied: string | null; copy: (value: string, label: string) => void }) {
  return (
    <div className="space-y-3 mb-5">
      <AddressRow label="Agent Signer" value={status?.signerAddress} copied={copied === "agent"} onCopy={() => status?.signerAddress && copy(status.signerAddress, "agent")} />
      <AddressRow label="Builder Address" value={status?.builderAddress} copied={copied === "builder"} onCopy={() => status?.builderAddress && copy(status.builderAddress, "builder")} />
      <AddressRow label="Fee Cap" value={status?.maxFeeRate ?? "0"} copied={false} onCopy={() => {}} />
    </div>
  );
}

function AddressRow({ label, value, copied, onCopy }: { label: string; value?: string | null; copied: boolean; onCopy: () => void }) {
  return (
    <div className="p-4 rounded-xl bg-card border border-border/50">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <code className="text-xs text-foreground break-all flex-1">{value ?? "Not prepared"}</code>
        {value && (
          <button onClick={onCopy} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-background transition-all">
            {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

function ConfirmRow({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button onClick={onChange} className="w-full flex items-center gap-3 p-4 rounded-xl bg-card border border-border/50 text-left hover:border-primary/30 transition-all">
      <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${checked ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
        {checked && <Check className="w-3.5 h-3.5" />}
      </span>
      <span className="text-sm text-foreground">{label}</span>
    </button>
  );
}

function InfoBox({ children, warning = false }: { children: React.ReactNode; warning?: boolean }) {
  return (
    <div className={`p-4 rounded-xl border ${warning ? "bg-amber-500/5 border-amber-500/20" : "bg-primary/5 border-primary/20"}`}>
      <div className="flex items-start gap-3">
        {warning ? <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" /> : <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />}
        <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>
      </div>
    </div>
  );
}
