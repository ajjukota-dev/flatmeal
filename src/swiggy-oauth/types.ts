export type FakeOAuthSession = {
  id: string;
  householdId: string;
  ownerMemberId: string;
  stateHash: string;
  codeVerifierHash: string;
  codeHash: string | null;
  redirectUri: string;
  expiresAt: string;
  consumedAt: string | null;
};

export type SwiggyConnectionStatus = "pending" | "connected" | "expired" | "revoked";
