import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Lock, Zap, CheckCircle2, XCircle, HardDrive,
  Wifi, WifiOff, AlertTriangle, Eye, RefreshCw, ChevronDown,
  ChevronUp, TrendingUp, Activity, Copy, ExternalLink
} from "lucide-react";
import WalletConnectModal from "./WalletConnectModal";

interface WalletPanelProps {
  walletAddress?: string | null;
  walletType?: string | null;
  copytradeEnabled?: boolean;
  killSwitchActive?: boolean;
  maxPositionSize?: number;
  maxDailyLoss?: number;
  onKillSwitch?: (active: boolean) => void;
  onRevoke?: () => void;
  onConnected?: (address: string, walletType: string) => void;
}

const securityBadges = [
  { icon: <Lock className="w-3 h-3" />, label: "Non-Custodial", color: "text-emerald-400", bg: "rgba(74,222,128,0.08)", border: "rgba(74,222,128,0.15)" },
  { icon: <Shield className="w-3 h-3" />, label: "Keys On-Device", color: "text-blue-400", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.15)" },
  { icon: <Eye className="w-3 h-3" />, label: "Read-Only Access", color: "text-purple-400", bg: "rgba(168,85,247,0.08)", border: "rgba(168,85,247,0.15)" },
  { icon: <Zap className="w-3 h-3" />, label: "Instant Revoke", color: "text-amber-400", bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.15)" },
];

const walletTypeLabels: Record<string, string> = {
  ledger: "Ledger Nano",
  metamask: "MetaMask",
  walletconnect: "WalletConnect",
  coinbase: "Coinbase Wallet",
  other: "Web3 Wallet",
};

export default function WalletPanel({
  walletAddress,
  walletType,
  copytradeEnabled = false,
  killSwitchActive = false,
  maxPositionSize = 10,
  maxDailyLoss = 5,
  onKillSwitch,
  onRevoke,
  onConnected,
}: WalletPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [killActive, setKillActive] = useState(killSwitchActive);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState(false);

  const isConnected = !!walletAddress;

  const handleKillSwitch = () => {
    const next = !killActive;
    setKillActive(next);
    onKillSwitch?.(next);
  };

  const handleCopyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRevoke = () => {
    if (revokeConfirm) {
      onRevoke?.();
      setRevokeConfirm(false);
    } else {
      setRevokeConfirm(true);
      setTimeout(() => setRevokeConfirm(false), 4000);
    }
  };

  const truncate = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <>
      <div className="rounded-2xl overflow-hidden" style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}>
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: isConnected ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.05)", border: `1px solid ${isConnected ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.08)"}` }}>
                {isConnected
                  ? <HardDrive className="w-4 h-4 text-emerald-400" />
                  : <WifiOff className="w-4 h-4 text-white/30" />}
              </div>
              <div>
                <p className="text-white font-semibold text-sm">
                  {isConnected ? walletTypeLabels[walletType || "other"] : "Wallet"}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${isConnected && !killActive ? "bg-emerald-400" : isConnected && killActive ? "bg-amber-400" : "bg-white/20"}`}
                    style={isConnected && !killActive ? { boxShadow: "0 0 6px rgba(74,222,128,0.8)" } : {}} />
                  <span className="text-xs text-white/40">
                    {isConnected
                      ? killActive ? "Kill switch active" : copytradeEnabled ? "Copytrade live" : "Connected · Awaiting signals"
                      : "Not connected"}
                  </span>
                </div>
              </div>
            </div>
            {isConnected && (
              <button onClick={() => setShowDetails(!showDetails)} className="text-white/30 hover:text-white/60 transition-colors">
                {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Not connected state */}
        {!isConnected && (
          <div className="p-5">
            <p className="text-white/40 text-sm leading-relaxed mb-5">
              Connect your Ledger Nano or Web3 wallet to enable copytrade signal routing. Your funds stay on your device — Anavitrade only mirrors trade signals.
            </p>

            {/* Security badges */}
            <div className="grid grid-cols-2 gap-2 mb-5">
              {securityBadges.map((badge, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ background: badge.bg, border: `1px solid ${badge.border}` }}>
                  <span className={badge.color}>{badge.icon}</span>
                  <span className={`text-xs font-medium ${badge.color}`}>{badge.label}</span>
                </div>
              ))}
            </div>

            <motion.button
              data-wallet-connect-btn
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setModalOpen(true)}
              className="w-full py-3 rounded-xl text-black font-semibold text-sm flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #4ade80, #22c55e)" }}
            >
              <Wifi className="w-4 h-4" />
              Connect Wallet
            </motion.button>
          </div>
        )}

        {/* Connected state */}
        {isConnected && (
          <div className="p-5 space-y-4">
            {/* Address row */}
            <div className="flex items-center justify-between p-3 rounded-xl"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div>
                <p className="text-white/30 text-xs mb-0.5">Wallet Address</p>
                <p className="text-white font-mono text-sm">{truncate(walletAddress!)}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={handleCopyAddress}
                  className="p-2 rounded-lg text-white/30 hover:text-white/60 transition-colors"
                  style={{ background: "rgba(255,255,255,0.04)" }}>
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <a href={`https://etherscan.io/address/${walletAddress}`} target="_blank" rel="noopener noreferrer"
                  className="p-2 rounded-lg text-white/30 hover:text-white/60 transition-colors"
                  style={{ background: "rgba(255,255,255,0.04)" }}>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Copytrade status */}
            <div className="flex items-center justify-between p-3 rounded-xl"
              style={{
                background: copytradeEnabled && !killActive ? "rgba(74,222,128,0.05)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${copytradeEnabled && !killActive ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.06)"}`,
              }}>
              <div className="flex items-center gap-2">
                <Activity className={`w-4 h-4 ${copytradeEnabled && !killActive ? "text-emerald-400" : "text-white/30"}`} />
                <div>
                  <p className="text-white text-sm font-medium">Copytrade</p>
                  <p className="text-white/40 text-xs">
                    {killActive ? "Paused by kill switch" : copytradeEnabled ? "Receiving signals" : "Awaiting algo wire-in"}
                  </p>
                </div>
              </div>
              <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                killActive ? "text-amber-400 bg-amber-400/10" :
                copytradeEnabled ? "text-emerald-400 bg-emerald-400/10" :
                "text-white/30 bg-white/5"
              }`}>
                {killActive ? "Paused" : copytradeEnabled ? "Live" : "Pending"}
              </div>
            </div>

            {/* Kill switch */}
            <div className="p-3 rounded-xl" style={{
              background: killActive ? "rgba(251,191,36,0.08)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${killActive ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.06)"}`,
            }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className={`w-4 h-4 ${killActive ? "text-amber-400" : "text-white/40"}`} />
                  <div>
                    <p className="text-white text-sm font-medium">Kill Switch</p>
                    <p className="text-white/40 text-xs">Instantly halts all signal routing</p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleKillSwitch}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    killActive
                      ? "text-black bg-amber-400"
                      : "text-amber-400 border border-amber-400/30 hover:bg-amber-400/10"
                  }`}
                >
                  {killActive ? "RESUME" : "HALT"}
                </motion.button>
              </div>
              {killActive && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="text-amber-400/70 text-xs">All copytrade signals are paused. No new transactions will be sent to your wallet until you resume.</p>
                </motion.div>
              )}
            </div>

            {/* Expandable details */}
            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3 overflow-hidden"
                >
                  {/* Risk limits */}
                  <div className="p-3 rounded-xl space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2">Risk Limits</p>
                    <div className="flex justify-between items-center">
                      <span className="text-white/50 text-xs">Max position size</span>
                      <span className="text-white text-xs font-semibold">{maxPositionSize}% of portfolio</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/50 text-xs">Max daily loss</span>
                      <span className="text-red-400 text-xs font-semibold">{maxDailyLoss}% auto-pause</span>
                    </div>
                  </div>

                  {/* Security badges */}
                  <div className="grid grid-cols-2 gap-2">
                    {securityBadges.map((badge, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                        style={{ background: badge.bg, border: `1px solid ${badge.border}` }}>
                        <span className={badge.color}>{badge.icon}</span>
                        <span className={`text-xs font-medium ${badge.color}`}>{badge.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Revoke */}
                  <button
                    onClick={handleRevoke}
                    className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                      revokeConfirm
                        ? "text-white bg-red-500/80 border-red-500"
                        : "text-red-400 hover:bg-red-400/10"
                    }`}
                    style={{ border: `1px solid ${revokeConfirm ? "rgba(239,68,68,0.6)" : "rgba(239,68,68,0.2)"}` }}
                  >
                    {revokeConfirm ? (
                      <><AlertTriangle className="w-3.5 h-3.5" /> Click again to confirm revocation</>
                    ) : (
                      <><RefreshCw className="w-3.5 h-3.5" /> Revoke Wallet Access</>
                    )}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Copytrade info footer */}
            {!showDetails && (
              <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: "rgba(74,222,128,0.04)", border: "1px solid rgba(74,222,128,0.08)" }}>
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                <p className="text-white/40 text-xs leading-relaxed">
                  <strong className="text-white/60">Your funds never leave your wallet.</strong> Anavitrade routes trade signals to your device — each transaction requires your physical approval on the hardware.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <WalletConnectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onConnected={(addr, type) => {
          setModalOpen(false);
          onConnected?.(addr, type);
        }}
      />
    </>
  );
}
