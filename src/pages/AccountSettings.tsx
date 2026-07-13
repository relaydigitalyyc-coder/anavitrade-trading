import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  User, Shield, Key, AlertTriangle, CheckCircle2,
  HardDrive, ExternalLink, Eye, EyeOff, Zap, ZapOff
} from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";

type Tab = "profile" | "security" | "wallet" | "web3" | "risk";

export default function AccountSettings() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("profile");

  const tabs = [
    { id: "profile" as Tab, label: "Profile", icon: <User className="w-4 h-4" /> },
    { id: "security" as Tab, label: "Security", icon: <Shield className="w-4 h-4" /> },
    { id: "wallet" as Tab, label: "Aster Agent", icon: <Key className="w-4 h-4" /> },
    { id: "web3" as Tab, label: "Ledger / Web3", icon: <HardDrive className="w-4 h-4" /> },
    { id: "risk" as Tab, label: "Risk Controls", icon: <AlertTriangle className="w-4 h-4" /> },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-heading font-bold text-foreground">Account Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">{user?.email}</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar tabs */}
          <div className="lg:w-52 shrink-0">
            <nav className="space-y-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    tab === t.id
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-card"
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab content */}
          <div className="flex-1">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              {tab === "profile" && <ProfileTab user={user} />}
              {tab === "security" && <SecurityTab />}
              {tab === "wallet" && <WalletTab />}
              {tab === "web3" && <Web3WalletTab />}
              {tab === "risk" && <RiskTab />}
            </motion.div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

/* ── Profile Tab ── */
function ProfileTab({ user }: { user: any }) {
  const [name, setName] = useState(user?.name ?? "");
  const utils = trpc.useUtils();

  const update = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated.");
      utils.auth.me.invalidate();
    },
    onError: () => toast.error("Failed to update profile."),
  });

  return (
    <div className="space-y-6">
      <SectionHeader title="Profile" subtitle="Update your name and account information." />
      <div className="p-6 rounded-2xl bg-card border border-border/50 space-y-5">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Full Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Email Address</label>
          <input
            type="email"
            value={user?.email ?? ""}
            disabled
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-muted-foreground cursor-not-allowed"
          />
          <p className="text-xs text-muted-foreground mt-1">Email cannot be changed. Contact support if needed.</p>
        </div>
        <button
          onClick={() => update.mutate({ name })}
          disabled={update.isPending || !name.trim()}
          className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {update.isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

/* ── Security Tab ── */
function SecurityTab() {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const change = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Password changed successfully.");
      setForm({ current: "", next: "", confirm: "" });
    },
    onError: (e) => {
      if (e.message.includes("incorrect")) setErrors({ current: "Current password is incorrect." });
      else toast.error("Failed to change password.");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.current) errs.current = "Enter your current password.";
    if (form.next.length < 8) errs.next = "New password must be at least 8 characters.";
    if (form.next !== form.confirm) errs.confirm = "Passwords do not match.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    change.mutate({ currentPassword: form.current, newPassword: form.next });
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Security" subtitle="Change your password and manage account security." />
      <div className="p-6 rounded-2xl bg-card border border-border/50">
        <h3 className="text-sm font-semibold text-foreground mb-5">Change Password</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { key: "current", label: "Current Password", placeholder: "Your current password" },
            { key: "next", label: "New Password", placeholder: "Min. 8 characters" },
            { key: "confirm", label: "Confirm New Password", placeholder: "Repeat new password" },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder}
                  className={`w-full px-4 py-3 pr-12 rounded-xl bg-background border text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${errors[key] ? "border-red-500" : "border-border"}`}
                />
                {key === "current" && (
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}
              </div>
              {errors[key] && <p className="text-red-400 text-xs mt-1">{errors[key]}</p>}
            </div>
          ))}
          <button
            type="submit"
            disabled={change.isPending}
            className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {change.isPending ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* Aster Agent Tab */
function WalletTab() {
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: config } = trpc.aster.getConfig.useQuery();
  const { data: status, isLoading } = trpc.aster.getStatus.useQuery();

  const revoke = trpc.aster.revokeAgent.useMutation({
    onSuccess: () => {
      toast.success("Aster Agent access revoked. DEX execution stopped.");
      setConfirmRevoke(false);
      utils.aster.getStatus.invalidate();
    },
    onError: () => toast.error("Failed to revoke Aster Agent."),
  });

  const statusColors: Record<string, string> = {
    active: "text-primary bg-primary/10 border-primary/20",
    pending_approval: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    revoked: "text-red-400 bg-red-400/10 border-red-400/20",
    missing: "text-muted-foreground bg-muted/30 border-border",
    paused: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  };

  const currentStatus = status?.status ?? "missing";

  return (
    <div className="space-y-6">
      <SectionHeader title="Aster Agent" subtitle="Manage your Aster Agent signer and Builder approval status. The Agent is for trade execution only and must not have withdrawal permission." />

      {isLoading ? (
        <div className="p-6 rounded-2xl bg-card border border-border/50 animate-pulse h-32" />
      ) : currentStatus !== "missing" ? (
        <div className="p-6 rounded-2xl bg-card border border-border/50 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusColors[currentStatus] ?? statusColors.missing}`}>
                  {currentStatus.replace("_", " ").toUpperCase()}
                </span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Aster DEX
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Builder {config?.configured ? "configured" : "not configured"}</p>
            </div>
            {currentStatus === "active" && <CheckCircle2 className="w-5 h-5 text-primary" />}
          </div>

          <div className="space-y-3">
            <InfoRow label="Aster Account" value={status?.asterAccountAddress ?? "Not recorded"} mono />
            <InfoRow label="Agent Signer" value={status?.signerAddress ?? "Not prepared"} mono />
            <InfoRow label="Builder Address" value={status?.builderAddress ?? config?.builderAddress ?? "Not configured"} mono />
            <InfoRow label="Agent Approval" value={status?.agentStatus ?? "missing"} />
            <InfoRow label="Builder Approval" value={status?.builderStatus ?? "missing"} />
            <InfoRow label="Fee Cap" value={status?.maxFeeRate ?? config?.defaultFeeRate ?? "0"} />
            <InfoRow label="Permissions" value="Perps only, withdrawals disabled, IP whitelist recommended for production" />
            {status?.approvalExpiresAt && <InfoRow label="Approval Expires" value={new Date(status.approvalExpiresAt).toLocaleString()} />}
          </div>

          <div className="pt-4 border-t border-border/50 flex gap-3 flex-wrap">
            <button
              onClick={() => navigate("/onboarding/aster")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all"
            >
              <Key className="w-4 h-4" /> Manage Aster Setup
            </button>
            {currentStatus === "active" && !confirmRevoke && (
              <button
                onClick={() => setConfirmRevoke(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/30 text-red-400 text-sm hover:bg-red-500/5 transition-all"
              >
                <ZapOff className="w-4 h-4" /> Revoke Agent
              </button>
            )}
          </div>

          {confirmRevoke && (
            <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20">
              <p className="text-sm text-foreground font-semibold mb-1">Confirm Aster Agent revocation?</p>
              <p className="text-xs text-muted-foreground mb-4">This stops Anavitrade DEX execution. You should also revoke the Agent directly in Aster if available.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => revoke.mutate()}
                  disabled={revoke.isPending}
                  className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-all disabled:opacity-50"
                >
                  {revoke.isPending ? "Revoking..." : "Yes, Revoke Agent"}
                </button>
                <button onClick={() => setConfirmRevoke(false)} className="px-4 py-2 rounded-xl border border-border text-foreground text-sm hover:bg-card transition-all">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-6 rounded-2xl bg-card border border-border/50 text-center">
          <Key className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-foreground mb-2">No Aster Agent connected</h3>
          <p className="text-xs text-muted-foreground mb-5">Prepare an Agent signer and approve Anavitrade's Builder fee cap to enable Aster DEX execution.</p>
          <button
            onClick={() => navigate("/onboarding/aster")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all"
          >
            <Key className="w-4 h-4" /> Connect Aster
          </button>
        </div>
      )}

      <div className="p-4 rounded-xl bg-card border border-border/50">
        <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-primary" /> Aster approval model
        </h4>
        <p className="text-xs text-muted-foreground mb-3">
          Users approve an Agent signer for trade execution and approve the Anavitrade Builder fee cap. Platform 2-and-20 fees are tracked separately in the Anavitrade fee ledger.
        </p>
        <a
          href="https://asterdex.github.io/aster-api-website/asterCode/integration-flow/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          Open Aster Code docs <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

/* ── Risk Controls Tab ── */
function RiskTab() {
  const { data, refetch } = trpc.liveAccount.get.useQuery();
  const account = data?.account;

  const [settings, setSettings] = useState({
    maxDailyLossPct: account?.maxDailyLossPct ?? "5.00",
    maxLeverage: account?.maxLeverage ?? "10.00",
    maxPositionSizePct: account?.maxPositionSizePct ?? "10.00",
  });

  const updateSettings = trpc.liveAccount.updateRiskSettings.useMutation({
    onSuccess: () => { toast.success("Risk settings updated."); refetch(); },
    onError: () => toast.error("Failed to update settings."),
  });

  const toggleKill = trpc.liveAccount.toggleKillSwitch.useMutation({
    onSuccess: (d) => {
      toast.success(d.killSwitchActive ? "Kill switch activated — trading paused." : "Kill switch deactivated — trading resumed.");
      refetch();
    },
    onError: () => toast.error("Failed to toggle kill switch."),
  });

  const killActive = account?.killSwitchActive ?? false;

  return (
    <div className="space-y-6">
      <SectionHeader title="Risk Controls" subtitle="Configure maximum loss limits, leverage, and position sizes. These limits are enforced by the trade engine." />

      {/* Kill switch */}
      <div className={`p-5 rounded-2xl border ${killActive ? "bg-red-500/5 border-red-500/30" : "bg-card border-border/50"}`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {killActive ? <ZapOff className="w-5 h-5 text-red-400" /> : <Zap className="w-5 h-5 text-primary" />}
              <h3 className="text-sm font-semibold text-foreground">Emergency Kill Switch</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {killActive
                ? "Kill switch is ACTIVE. All new trade executions are paused. Open positions remain until they hit their take-profit or stop-loss."
                : "Kill switch is inactive. The trade engine is running normally."}
            </p>
          </div>
          <button
            onClick={() => toggleKill.mutate({ active: !killActive })}
            disabled={toggleKill.isPending}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${
              killActive
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20"
            }`}
          >
            {toggleKill.isPending ? "..." : killActive ? "Resume Trading" : "Activate Kill Switch"}
          </button>
        </div>
      </div>

      {/* Risk settings */}
      <div className="p-6 rounded-2xl bg-card border border-border/50 space-y-5">
        <h3 className="text-sm font-semibold text-foreground">Position Limits</h3>
        {[
          { key: "maxDailyLossPct", label: "Max Daily Loss", unit: "% of equity", hint: "Pause trading if daily loss exceeds this threshold." },
          { key: "maxLeverage", label: "Max Leverage", unit: "x", hint: "Maximum leverage applied to any single position." },
          { key: "maxPositionSizePct", label: "Max Position Size", unit: "% of equity", hint: "Maximum size of any single position as a percentage of your account equity." },
        ].map(({ key, label, unit, hint }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-foreground mb-1">{label}</label>
            <p className="text-xs text-muted-foreground mb-2">{hint}</p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0.1"
                max="100"
                step="0.5"
                value={settings[key as keyof typeof settings]}
                onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                className="w-32 px-4 py-2.5 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm"
              />
              <span className="text-sm text-muted-foreground">{unit}</span>
            </div>
          </div>
        ))}
        <button
          onClick={() => updateSettings.mutate(settings)}
          disabled={updateSettings.isPending}
          className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {updateSettings.isPending ? "Saving..." : "Save Risk Settings"}
        </button>
      </div>
    </div>
  );
}

/* ── Web3 / Ledger Wallet Tab ── */
function Web3WalletTab() {
  const [, navigate] = useLocation();
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const { data: session, isLoading, refetch } = trpc.web3Wallet.getSession.useQuery();

  const revoke = trpc.web3Wallet.revoke.useMutation({
    onSuccess: () => {
      toast.success("Ledger / Web3 wallet disconnected. Copytrade signals paused.");
      setConfirmRevoke(false);
      refetch();
    },
    onError: () => toast.error("Failed to disconnect wallet."),
  });

  const walletTypeLabel: Record<string, string> = {
    ledger: "Ledger Nano",
    metamask: "MetaMask",
    walletconnect: "WalletConnect",
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Ledger / Web3 Wallet"
        subtitle="Manage your hardware or Web3 wallet connection for copytrade signal routing. Your funds stay on your device — Anavitrade only mirrors trade signals."
      />

      {isLoading ? (
        <div className="p-6 rounded-2xl bg-card border border-border/50 animate-pulse h-32" />
      ) : session ? (
        <div className="p-6 rounded-2xl bg-card border border-border/50 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                  session.status === "active" ? "text-primary bg-primary/10 border-primary/20" : "text-red-400 bg-red-400/10 border-red-400/20"
                }`}>
                  {session.status.toUpperCase()}
                </span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary flex items-center gap-1">
                  <HardDrive className="w-3 h-3" /> {walletTypeLabel[session.walletType] ?? session.walletType}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Connected {new Date(session.connectedAt).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <span className="text-xs text-muted-foreground shrink-0 pt-0.5">Wallet Address</span>
              <span className="text-xs text-foreground text-right break-all font-mono">{session.walletAddress}</span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-xs text-muted-foreground shrink-0 pt-0.5">Chain</span>
              <span className="text-xs text-foreground">{session.chainId === 1 ? "Ethereum Mainnet" : `Chain ${session.chainId}`}</span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-xs text-muted-foreground shrink-0 pt-0.5">Permissions</span>
              <span className="text-xs text-foreground">Copytrade signal routing only — no fund access</span>
            </div>
          </div>

          {/* Security badges */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            {["Non-Custodial", "Keys On-Device", "Read-Only Access", "Instant Revoke"].map((badge) => (
              <div key={badge} className="flex items-center gap-2 p-2.5 rounded-lg bg-background border border-border/50">
                <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <span className="text-xs text-muted-foreground">{badge}</span>
              </div>
            ))}
          </div>

          {session.status === "active" && (
            <div className="pt-4 border-t border-border/50">
              {!confirmRevoke ? (
                <button
                  onClick={() => setConfirmRevoke(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/30 text-red-400 text-sm hover:bg-red-500/5 transition-all"
                >
                  <ZapOff className="w-4 h-4" /> Disconnect Wallet
                </button>
              ) : (
                <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                  <p className="text-sm text-foreground font-semibold mb-1">Disconnect this wallet?</p>
                  <p className="text-xs text-muted-foreground mb-4">Copytrade signal routing will stop immediately. Your funds remain untouched on your device. You can reconnect at any time.</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => revoke.mutate()}
                      disabled={revoke.isPending}
                      className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-all disabled:opacity-50"
                    >
                      {revoke.isPending ? "Disconnecting..." : "Yes, Disconnect"}
                    </button>
                    <button onClick={() => setConfirmRevoke(false)} className="px-4 py-2 rounded-xl border border-border text-foreground text-sm hover:bg-card transition-all">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="p-6 rounded-2xl bg-card border border-border/50 text-center">
          <HardDrive className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-foreground mb-2">No Ledger / Web3 wallet connected</h3>
          <p className="text-xs text-muted-foreground mb-5">Connect your Ledger Nano or Web3 wallet to enable copytrade signal routing. Your funds stay on your device.</p>
          <button
            onClick={() => navigate("/onboarding/ledger")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all"
          >
            <HardDrive className="w-4 h-4" /> Connect Ledger / Web3 Wallet
          </button>
        </div>
      )}

      <div className="p-4 rounded-xl bg-card border border-border/50">
        <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" /> How copytrade works
        </h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Anavitrade receives trade signals from the algorithm and mirrors them proportionally to your connected wallet. Your private keys never leave your device. You can revoke access at any time from this page or directly from your wallet app.
        </p>
      </div>
    </div>
  );
}

/* ── Shared sub-components ── */
function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-heading font-bold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-muted-foreground shrink-0 pt-0.5">{label}</span>
      <span className={`text-xs text-foreground text-right break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
