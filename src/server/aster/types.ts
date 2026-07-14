export type AsterApprovalStatus = "pending" | "approved" | "rejected" | "revoked" | "expired";

export type AsterAgentAccountStatus =
  | "missing"
  | "pending_approval"
  | "active"
  | "paused"
  | "revoked";

export type AsterAgentPermissions = {
  perp: boolean;
  spot: boolean;
  withdraw: boolean;
  maxFeeRate?: string;
  expiresAt?: string;
  ipWhitelist?: string[];
};

export type AsterAgentStatusView = {
  status: AsterAgentAccountStatus;
  asterAccountAddress?: string;
  signerAddress?: string;
  builderAddress?: string;
  agentStatus?: AsterApprovalStatus;
  builderStatus?: AsterApprovalStatus;
  feeRate?: string | null;
  maxFeeRate?: string | null;
  approvalExpiresAt?: number | null;
  permissions?: AsterAgentPermissions;
};

export type AsterOrderRequest = {
  user: string;
  signer: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  quantity: string;
  price?: string;
  timeInForce?: "GTC" | "IOC" | "FOK" | "GTX";
  newClientOrderId?: string;
  leverage?: number;
  builder: string;
  feeRate?: string;
};

export type ExecutionAdapterReceipt = {
  provider: "aster" | "cex";
  orderId: string;
  status: "accepted" | "filled" | "rejected";
  raw?: unknown;
};

export type ExecutionAdapter = {
  submitOrder(jobId: number, request: AsterOrderRequest): Promise<ExecutionAdapterReceipt>;
  cancelOrder(orderId: string): Promise<ExecutionAdapterReceipt>;
};

export type AsterAgentRegistrationParams = {
  user: string;
  nonce: string;
  agentName: string;
  agentAddress: string;
  expired: string;
  signatureChainId: "56";
  canSpotTrade: "true" | "false";
  canPerpTrade: "true" | "false";
  canWithdraw: "true" | "false";
  ipWhitelist: string;
};

export type AsterAgentRegistrationChallenge = {
  params: AsterAgentRegistrationParams;
  typedData: {
    domain: {
      name: "AsterSignTransaction";
      version: "1";
      chainId: 56;
      verifyingContract: "0x0000000000000000000000000000000000000000";
    };
    types: {
      Message: Array<{ name: "msg"; type: "string" }>;
    };
    primaryType: "Message";
    message: { msg: string };
  };
};
