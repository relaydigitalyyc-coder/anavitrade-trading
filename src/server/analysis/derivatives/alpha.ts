import type { DerivativesSnapshot, DerivativesAlpha } from "../types";

export interface AlphaConfig {
  demandVelocityWeight: number;   // Default 0.32
  leverageWeight: number;         // Default 0.22
  fundingWeight: number;          // Default 0.18
  crowdingWeight: number;         // Default 0.16
  liquidationWeight: number;      // Default 0.12
  maxAcceptableFundingRate: number; // Default 0.0005 (5bps)
  maxAcceptableLeverage: number;   // Default 0.35 (35% OI change)
}

const DEFAULT_ALPHA_CONFIG: AlphaConfig = {
  demandVelocityWeight: 0.32,
  leverageWeight: 0.22,
  fundingWeight: 0.18,
  crowdingWeight: 0.16,
  liquidationWeight: 0.12,
  maxAcceptableFundingRate: 0.0005,
  maxAcceptableLeverage: 0.35,
};

/**
 * Compute a derivatives alpha score (0-100) from snapshot data.
 *
 * Higher score = more bullish accumulation signal.
 * Lower score = crowded/distribution risk.
 *
 * All sub-components are centered so that neutral inputs produce
 * a score in the 45-55 range. Each component contributes +/- around
 * zero, so only meaningful deviations from neutral move the score.
 *
 * Components:
 * 1. Demand velocity (OI flow): neutral = 0 contribution
 * 2. Leverage concern: moderate OI change = 0 penalty
 * 3. Funding sanity: near-zero funding = 0 penalty
 * 4. Crowding: healthy L/S ratio = 0 contribution
 */
export function computeAlpha(
  snapshot: DerivativesSnapshot,
  previous: DerivativesSnapshot | null,
  config: AlphaConfig = DEFAULT_ALPHA_CONFIG,
): DerivativesAlpha {
  let score = 50; // neutral baseline
  const details: string[] = [];

  // --- 1. Demand velocity ---
  // Positive OI growth = bullish, negative = bearish. Neutral at 0.
  const oiChange =
    previous && previous.openInterest > 0
      ? (snapshot.openInterest - previous.openInterest) / previous.openInterest
      : 0;
  const demandDelta = Math.tanh(oiChange * 5); // -1 to +1
  const demandContribution = demandDelta * 16; // +/- 16 pts
  score += demandContribution;
  details.push(`demand_velocity=${demandContribution.toFixed(1)}`);

  // --- 2. Leverage concern ---
  // Extreme OI change (either direction) is concerning. Moderate = 0 penalty.
  const leverageRatio = Math.abs(oiChange) / config.maxAcceptableLeverage;
  const leveragePenalty = clamp(leverageRatio * 20 - 5, 0, 20);
  score -= leveragePenalty;
  details.push(`leverage_penalty=${leveragePenalty.toFixed(1)}`);

  // --- 3. Funding sanity ---
  // Near-zero funding rate = neutral (0 penalty).
  // Extreme funding (either positive or negative) = penalty.
  const absFundingRate = Math.abs(snapshot.fundingRate);
  const fundingRatio = absFundingRate / config.maxAcceptableFundingRate;
  const fundingPenalty = clamp(fundingRatio * 20 - 5, 0, 15);
  score -= fundingPenalty;

  if (snapshot.fundingRate > config.maxAcceptableFundingRate) {
    details.push(
      `funding=overheated(+${(snapshot.fundingRate * 10000).toFixed(0)}bps)`,
    );
  } else if (snapshot.fundingRate < -0.0002) {
    details.push(
      `funding=oversold(-${(Math.abs(snapshot.fundingRate) * 10000).toFixed(0)}bps)`,
    );
  } else {
    details.push(
      `funding=neutral(${(snapshot.fundingRate * 10000).toFixed(0)}bps)`,
    );
  }

  // --- 4. Crowding sanity ---
  // Healthy L/S ratio (0.75-1.35) = 0 contribution. Extreme = penalty.
  const lsRatio = snapshot.longShortRatio;
  let crowdingScore: number;
  if (lsRatio >= 0.75 && lsRatio <= 1.35) {
    crowdingScore = 16; // healthy range
  } else if (lsRatio > 1.35 && lsRatio <= 2.0) {
    crowdingScore = 10; // slightly crowded long
  } else if (lsRatio > 2.0) {
    crowdingScore = 4; // extremely crowded long
  } else if (lsRatio >= 0.5 && lsRatio < 0.75) {
    crowdingScore = 10; // slightly crowded short
  } else {
    crowdingScore = 4; // extremely crowded short
  }
  // Center so healthy = 0 contribution, extreme = -12
  score += crowdingScore - 16;
  details.push(
    `crowding=${lsRatio.toFixed(2)}(${(crowdingScore - 16).toFixed(0)}pts)`,
  );

  // Clamp
  const compositeScore = clamp(score, 0, 100);

  // Determine bias string
  let bias: string;
  if (compositeScore >= 70) {
    bias = "bullish_accumulation";
  } else if (compositeScore >= 55) {
    bias = "mildly_bullish";
  } else if (compositeScore >= 45) {
    bias = "neutral";
  } else if (compositeScore >= 30) {
    bias = "mildly_bearish";
  } else {
    bias = "bearish_distribution";
  }

  return {
    score: Math.round(compositeScore),
    bias,
    details: details.join("; "),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
