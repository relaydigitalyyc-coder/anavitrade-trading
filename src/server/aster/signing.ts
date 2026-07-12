import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

export function createAsterAgentKeypair() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return {
    signerAddress: account.address.toLowerCase(),
    privateKey,
  };
}
