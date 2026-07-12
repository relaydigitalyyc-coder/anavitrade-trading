import { Check, Lock } from "lucide-react";

export type ExchangeOption = {
  id: string;
  label: string;
  live: boolean;
  needsPassphrase: boolean;
  canVerifyPermissions: boolean;
  keyHint: string;
};

/**
 * Consumer exchange picker — a grid of top exchanges. Live ones are selectable;
 * the rest render as "Coming soon". Uses the hairline/glass design system.
 */
export default function ExchangePicker({
  exchanges,
  selected,
  onSelect,
}: {
  exchanges: ExchangeOption[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {exchanges.map((ex) => {
        const isSelected = selected === ex.id;
        return (
          <button
            key={ex.id}
            type="button"
            disabled={!ex.live}
            onClick={() => ex.live && onSelect(ex.id)}
            className="relative rounded-2xl p-4 text-left transition-all duration-200 disabled:cursor-not-allowed"
            style={{
              background: isSelected
                ? "oklch(0.60 0.22 220 / 0.10)"
                : "linear-gradient(145deg, oklch(0.12 0.022 250 / 0.85), oklch(0.09 0.018 255 / 0.90))",
              border: `1.4px solid ${isSelected ? "oklch(0.60 0.22 220 / 0.55)" : "oklch(0.60 0.22 220 / 0.14)"}`,
              opacity: ex.live ? 1 : 0.5,
              boxShadow: isSelected ? "0 0 0 1px oklch(0.60 0.22 220 / 0.2), 0 8px 24px oklch(0.07 0.015 255 / 0.4)" : "none",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className="w-9 h-9 rounded-xl inline-flex items-center justify-center font-heading font-bold text-sm"
                style={{
                  background: ex.live ? "var(--grad-arctic)" : "oklch(1 0 0 / 0.06)",
                  color: ex.live ? "oklch(0.14 0.02 255)" : "oklch(0.6 0.02 240)",
                }}
              >
                {ex.label.slice(0, 1)}
              </span>
              {isSelected && <Check className="w-4 h-4" style={{ color: "oklch(0.72 0.20 195)" }} />}
              {!ex.live && <Lock className="w-3.5 h-3.5 text-white/30" />}
            </div>
            <div className="font-heading font-medium text-sm text-foreground">{ex.label}</div>
            <div className="text-[0.7rem] mt-0.5" style={{ color: ex.live ? "oklch(0.72 0.20 195)" : "oklch(0.5 0.02 240)" }}>
              {ex.live ? "Live" : "Coming soon"}
            </div>
          </button>
        );
      })}
    </div>
  );
}
