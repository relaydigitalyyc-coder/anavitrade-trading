import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  CheckCircle2, ArrowRight, ArrowLeft, Shield, HardDrive,
  Wallet, Key, ExternalLink, AlertTriangle, Eye, EyeOff,
  Copy, Check, Zap
} from "lucide-react";
import { toast } from "sonner";

const STEPS = [
  { id: 1, title: "Create Hyperliquid Account", icon: <Wallet className="w-5 h-5" /> },
  { id: 2, title: "Deposit USDC", icon: <Zap className="w-5 h-5" /> },
  { id: 3, title: "Generate API Wallet", icon: <Key className="w-5 h-5" /> },
  { id: 4, title: "Ledger Approval", icon: <HardDrive className="w-5 h-5" /> },
  { id: 5, title: "Connect to Anavitrade", icon: <Shield className="w-5 h-5" /> },
];

export default function HyperliquidOnboarding() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [step, setStep] = useState(1);
  const [isLedger, setIsLedger] = useState<boolean | null>(null);
  const [form, setForm] = useState({
    hyperliquidAccount: "",
    walletAddress: "",
    privateKey: "",
  });
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  const connect = trpc.apiWallet.connect.useMutation({
    onSuccess: () => {
      toast.success("API wallet connected and validated!");
      navigate("/dashboard");
    },
    onError: (e) => {
      toast.error(e.message || "Connection failed. Please check your credentials.");
    },
  });

  function copyAddress() {
    navigator.clipboard.writeText("anavitrade-agent.eth");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleConnect() {
    if (!form.hyperliquidAccount || !form.walletAddress || !form.privateKey) {
      toast.error("Please fill in all fields.");
      return;
    }
    connect.mutate({
      hyperliquidAccount: form.hyperliquidAccount,
      walletAddress: form.walletAddress,
      privateKey: form.privateKey,
      isLedgerCustody: isLedger === true,
    });
  }

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer">
              <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center font-bold text-primary-foreground">@</div>
              <span className="font-heading font-bold text-foreground">Anavitrade</span>
            </div>
          </Link>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="w-4 h-4 text-primary" />
            <span>Secure onboarding</span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Progress bar */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center flex-1">
                <div className={`flex flex-col items-center gap-1.5 ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                    step > s.id ? "bg-primary border-primary text-primary-foreground" :
                    step === s.id ? "border-primary text-primary bg-primary/10" :
                    "border-border text-muted-foreground"
                  }`}>
                    {step > s.id ? <CheckCircle2 className="w-5 h-5" /> : s.icon}
                  </div>
                  <span className={`text-[10px] font-medium hidden sm:block text-center leading-tight max-w-[80px] ${step === s.id ? "text-primary" : "text-muted-foreground"}`}>
                    {s.title}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-px mx-2 mb-5 relative overflow-hidden bg-border">
                    <motion.div
                      className="absolute inset-y-0 left-0 bg-primary"
                      initial={{ width: "0%" }}
                      animate={{ width: step > s.id ? "100%" : "0%" }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          >
            {/* ── Step 1: Create Hyperliquid Account ── */}
            {step === 1 && (
              <StepCard
                title="Create Your Hyperliquid Account"
                subtitle="Hyperliquid is a decentralised perpetuals exchange. Your funds stay in your own account — Anavitrade never holds them."
              >
                <div className="space-y-4 mb-8">
                  <StepItem num={1} text="Go to app.hyperliquid.xyz and connect your wallet (MetaMask, Ledger, or any Web3 wallet)." />
                  <StepItem num={2} text="Complete the one-time wallet signature to activate your Hyperliquid account." />
                  <StepItem num={3} text="Your Hyperliquid account address is the same as your connected wallet address." />
                </div>
                <a href="https://app.hyperliquid.xyz" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-card border border-border hover:border-primary/30 text-foreground text-sm font-medium transition-all mb-6">
                  Open Hyperliquid <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <InfoBox icon={<Shield className="w-4 h-4 text-primary" />}>
                  Anavitrade only needs trade-execution access to your Hyperliquid account. We will never request withdrawal permissions or your private key.
                </InfoBox>
              </StepCard>
            )}

            {/* ── Step 2: Deposit USDC ── */}
            {step === 2 && (
              <StepCard
                title="Deposit USDC to Hyperliquid"
                subtitle="Fund your Hyperliquid account with USDC. This is the capital Anavitrade will trade on your behalf."
              >
                <div className="space-y-4 mb-8">
                  <StepItem num={1} text="In Hyperliquid, click 'Deposit' and select USDC on Arbitrum." />
                  <StepItem num={2} text="Transfer USDC from your wallet to your Hyperliquid account. Minimum recommended: $500 USDC." />
                  <StepItem num={3} text="Wait for the deposit to confirm (usually under 2 minutes on Arbitrum)." />
                  <StepItem num={4} text="Confirm your balance appears in the Hyperliquid portfolio view before proceeding." />
                </div>
                <div className="p-5 rounded-xl bg-card border border-border/50 mb-6">
                  <h4 className="text-sm font-semibold text-foreground mb-3">Recommended Starting Amounts</h4>
                  <div className="grid grid-cols-3 gap-3">
                    {[["$500", "Starter"], ["$2,000", "Standard"], ["$10,000+", "Professional"]].map(([amount, label]) => (
                      <div key={label} className="text-center p-3 rounded-lg bg-background border border-border">
                        <div className="text-primary font-bold font-heading">{amount}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <InfoBox icon={<AlertTriangle className="w-4 h-4 text-amber-400" />} variant="warning">
                  Only deposit funds you are prepared to trade. Cryptocurrency trading carries significant risk. Past performance does not guarantee future results.
                </InfoBox>
              </StepCard>
            )}

            {/* ── Step 3: Generate API Wallet ── */}
            {step === 3 && (
              <StepCard
                title="Generate a Dedicated API Wallet"
                subtitle="A Hyperliquid API wallet is a separate key that can execute trades on your account but cannot withdraw funds. This is what Anavitrade uses."
              >
                <div className="space-y-4 mb-8">
                  <StepItem num={1} text="In Hyperliquid, go to Settings → API Wallets." />
                  <StepItem num={2} text="Click 'Generate API Wallet' — Hyperliquid will create a new key pair." />
                  <StepItem num={3} text="Copy and securely save the API wallet private key. You will enter it in Step 5." />
                  <StepItem num={4} text="Note the API wallet address (public key) — you will also need this in Step 5." />
                  <StepItem num={5} text="Do NOT use your main account private key. Only use the dedicated API wallet key." />
                </div>
                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 mb-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-400 mb-1">Important: One API wallet per service</p>
                      <p className="text-xs text-muted-foreground">Create a fresh API wallet specifically for Anavitrade. Do not reuse an API wallet that is connected to another service — this prevents nonce collisions and keeps your account secure.</p>
                    </div>
                  </div>
                </div>
                <a href="https://app.hyperliquid.xyz/settings" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-card border border-border hover:border-primary/30 text-foreground text-sm font-medium transition-all">
                  Open Hyperliquid Settings <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </StepCard>
            )}

            {/* ── Step 4: Ledger Approval ── */}
            {step === 4 && (
              <StepCard
                title="Ledger Nano — Approve the API Wallet"
                subtitle="If you are using a Ledger Nano as your custody wallet, your Ledger signs the one-time API wallet approval. If you are not using a Ledger, you can skip this step."
              >
                {/* Ledger / No Ledger toggle */}
                {isLedger === null && (
                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <button
                      onClick={() => setIsLedger(true)}
                      className="p-5 rounded-xl bg-card border-2 border-border hover:border-primary/50 transition-all text-left group"
                    >
                      <HardDrive className="w-6 h-6 text-primary mb-3" />
                      <div className="font-semibold text-foreground text-sm mb-1">I use a Ledger Nano</div>
                      <div className="text-xs text-muted-foreground">My Hyperliquid account is controlled by a Ledger hardware wallet</div>
                    </button>
                    <button
                      onClick={() => setIsLedger(false)}
                      className="p-5 rounded-xl bg-card border-2 border-border hover:border-border/80 transition-all text-left"
                    >
                      <Wallet className="w-6 h-6 text-muted-foreground mb-3" />
                      <div className="font-semibold text-foreground text-sm mb-1">I use a software wallet</div>
                      <div className="text-xs text-muted-foreground">MetaMask, Rabby, or another browser wallet</div>
                    </button>
                  </div>
                )}

                {isLedger === true && (
                  <div className="space-y-4 mb-8">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 mb-2">
                      <HardDrive className="w-4 h-4 text-primary" />
                      <span className="text-sm text-primary font-medium">Ledger Nano flow selected</span>
                      <button onClick={() => setIsLedger(null)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Change</button>
                    </div>
                    <StepItem num={1} text="Connect your Ledger Nano to your computer and open the Ethereum app." />
                    <StepItem num={2} text="In Hyperliquid Settings → API Wallets, click 'Approve API Wallet'." />
                    <StepItem num={3} text="Hyperliquid will ask you to sign an approval transaction. Review it on your Ledger screen." />
                    <StepItem num={4} text="Confirm on your Ledger. This is a one-time approval — your Ledger will NOT sign every trade." />
                    <StepItem num={5} text="After approval, the API wallet will show as 'Active' in Hyperliquid settings." />
                    <InfoBox icon={<Shield className="w-4 h-4 text-primary" />}>
                      Your Ledger signs only this setup approval. All subsequent trade executions run through the API wallet automatically — no Ledger interaction required per trade.
                    </InfoBox>
                  </div>
                )}

                {isLedger === false && (
                  <div className="space-y-4 mb-8">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border mb-2">
                      <Wallet className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-foreground font-medium">Software wallet flow selected</span>
                      <button onClick={() => setIsLedger(null)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Change</button>
                    </div>
                    <StepItem num={1} text="In Hyperliquid Settings → API Wallets, click 'Approve API Wallet'." />
                    <StepItem num={2} text="Your browser wallet (MetaMask, Rabby, etc.) will prompt you to sign an approval." />
                    <StepItem num={3} text="Review and confirm the signature. This grants trade-only access to the API wallet." />
                    <StepItem num={4} text="The API wallet will show as 'Active' in Hyperliquid settings once approved." />
                  </div>
                )}

                {isLedger === null && (
                  <InfoBox icon={<Shield className="w-4 h-4 text-primary" />}>
                    Regardless of which wallet you use, Anavitrade only receives trade-execution access. Withdrawal permissions are never granted.
                  </InfoBox>
                )}
              </StepCard>
            )}

            {/* ── Step 5: Connect to Anavitrade ── */}
            {step === 5 && (
              <StepCard
                title="Connect Your API Wallet to Anavitrade"
                subtitle="Enter your Hyperliquid account address and the API wallet credentials you generated in Step 3. These are stored encrypted — we never see your raw private key."
              >
                <div className="space-y-5 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Hyperliquid Account Address
                      <span className="text-muted-foreground font-normal ml-1">(your main wallet address)</span>
                    </label>
                    <input
                      type="text"
                      value={form.hyperliquidAccount}
                      onChange={(e) => setForm({ ...form, hyperliquidAccount: e.target.value })}
                      placeholder="0xYourHyperliquidAccountAddress"
                      className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-mono text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      API Wallet Address
                      <span className="text-muted-foreground font-normal ml-1">(the dedicated API wallet public key)</span>
                    </label>
                    <input
                      type="text"
                      value={form.walletAddress}
                      onChange={(e) => setForm({ ...form, walletAddress: e.target.value })}
                      placeholder="0xYourAPIWalletAddress"
                      className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-mono text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      API Wallet Private Key
                      <span className="text-muted-foreground font-normal ml-1">(trade-only — NOT your main wallet key)</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showKey ? "text" : "password"}
                        value={form.privateKey}
                        onChange={(e) => setForm({ ...form, privateKey: e.target.value })}
                        placeholder="0xYourAPIWalletPrivateKey"
                        className="w-full px-4 py-3 pr-12 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-mono text-sm"
                      />
                      <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {isLedger !== null && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
                      <div className={`w-4 h-4 rounded flex items-center justify-center ${isLedger ? "bg-primary" : "bg-border"}`}>
                        {isLedger && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <span className="text-sm text-foreground">
                        {isLedger ? "Ledger Nano custody confirmed" : "Software wallet custody"}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 mb-6">
                  <div className="flex items-start gap-3">
                    <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-foreground mb-1">Your key is encrypted before storage</p>
                      <p className="text-xs text-muted-foreground">Your API wallet private key is encrypted with AES-256 before being stored. Anavitrade staff cannot read your raw key. You can revoke access at any time from Account Settings.</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleConnect}
                  disabled={connect.isPending || !form.hyperliquidAccount || !form.walletAddress || !form.privateKey}
                  className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-[0.98] transition-all duration-150 shadow-lg shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {connect.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Validating & Connecting...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Shield className="w-4 h-4" /> Connect API Wallet
                    </span>
                  )}
                </button>
              </StepCard>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          <button
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-card transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-4 h-4" /> Previous
          </button>

          {step < 5 && (
            <button
              onClick={() => {
                if (step === 4 && isLedger === null) {
                  toast.error("Please select your wallet type to continue.");
                  return;
                }
                setStep(step + 1);
              }}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all shadow-lg shadow-primary/20"
            >
              {step === 4 && isLedger === null ? "Select wallet type" : "Continue"} <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {step === 5 && (
            <Link href="/dashboard">
              <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-muted-foreground text-sm hover:text-foreground hover:bg-card transition-all">
                Skip for now
              </button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function StepCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-heading font-bold text-foreground mb-2">{title}</h2>
      <p className="text-muted-foreground mb-8 leading-relaxed">{subtitle}</p>
      {children}
    </div>
  );
}

function StepItem({ num, text }: { num: number; text: string }) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-xs font-bold text-primary">{num}</span>
      </div>
      <p className="text-sm text-foreground/80 leading-relaxed pt-0.5">{text}</p>
    </div>
  );
}

function InfoBox({ icon, children, variant = "default" }: { icon: React.ReactNode; children: React.ReactNode; variant?: "default" | "warning" }) {
  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${variant === "warning" ? "bg-amber-500/5 border-amber-500/20" : "bg-primary/5 border-primary/20"}`}>
      <div className="shrink-0 mt-0.5">{icon}</div>
      <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}
