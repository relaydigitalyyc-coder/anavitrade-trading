type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

type AsterTypedData = {
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const REQUIRED_APPROVE_AGENT_FIELDS = [
  "AgentName",
  "AgentAddress",
  "IpWhitelist",
  "Expired",
  "CanSpotTrade",
  "CanPerpTrade",
  "CanWithdraw",
  "Builder",
  "MaxFeeRate",
  "BuilderName",
  "User",
  "Nonce",
];

function isAddressLike(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function validateAsterRegistrationTypedData(input: {
  account: `0x${string}`;
  signatureChainId: number;
  typedData: AsterTypedData;
}): void {
  const { account, signatureChainId, typedData } = input;
  if (typedData.domain?.name !== "AsterSignTransaction" || typedData.domain?.version !== "1") {
    throw new Error("Invalid Aster signature challenge.");
  }
  if (typedData.domain?.chainId !== signatureChainId) {
    throw new Error("Invalid Aster signature chain.");
  }
  if (String(typedData.domain?.verifyingContract ?? "").toLowerCase() !== ZERO_ADDRESS) {
    throw new Error("Invalid Aster signature verifier.");
  }
  if (typedData.primaryType !== "ApproveAgent") {
    throw new Error("Invalid Aster signature challenge type.");
  }
  const fields = typedData.types?.ApproveAgent ?? [];
  const fieldNames = new Set(fields.map((field) => field.name));
  if (!fields.length || REQUIRED_APPROVE_AGENT_FIELDS.some((field) => !fieldNames.has(field))) {
    throw new Error("Invalid Aster signature fields.");
  }
  if (typedData.message?.CanWithdraw !== false || typedData.message?.CanPerpTrade !== true) {
    throw new Error("Invalid Aster agent permissions.");
  }
  if (!isAddressLike(typedData.message?.AgentAddress) || !isAddressLike(typedData.message?.Builder) || !isAddressLike(typedData.message?.User)) {
    throw new Error("Invalid Aster signature addresses.");
  }
  if (String(typedData.message.User).toLowerCase() !== account.toLowerCase()) {
    throw new Error("Aster signature account mismatch.");
  }
}

export async function signAsterRegistrationTypedData(input: {
  provider: Eip1193Provider | null | undefined;
  account: `0x${string}`;
  signatureChainId: number;
  typedData: AsterTypedData;
}): Promise<`0x${string}`> {
  if (!input.provider?.request) {
    throw new Error("Wallet provider is not available. Reconnect your wallet and try again.");
  }
  validateAsterRegistrationTypedData({
    account: input.account,
    signatureChainId: input.signatureChainId,
    typedData: input.typedData,
  });

  const signature = await input.provider.request({
    method: "eth_signTypedData_v4",
    params: [input.account, JSON.stringify(input.typedData)],
  });

  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    throw new Error("Wallet returned an invalid Aster activation signature.");
  }

  return signature as `0x${string}`;
}
