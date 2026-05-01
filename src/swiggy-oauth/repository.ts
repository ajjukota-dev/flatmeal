import type { FakeOAuthSession, SwiggyConnectionStatus } from "./types.js";

export type OAuthSessionCreate = {
  householdId: string;
  ownerMemberId: string;
  stateHash: string;
  codeVerifierHash: string;
  redirectUri: string;
  expiresAt: Date;
};

export interface SwiggyOAuthRepository {
  isOwnerMember(input: { householdId: string; ownerMemberId: string }): Promise<boolean>;
  createOAuthSession(input: OAuthSessionCreate): Promise<FakeOAuthSession>;
  findOAuthSessionByStateHash(stateHash: string): Promise<FakeOAuthSession | null>;
  findOAuthSessionByCodeHash(codeHash: string): Promise<FakeOAuthSession | null>;
  attachAuthorizationCode(input: { sessionId: string; codeHash: string }): Promise<void>;
  consumeOAuthSession(sessionId: string): Promise<void>;
  upsertSwiggyConnection(input: {
    householdId: string;
    ownerMemberId: string;
    encryptedAccessToken: string;
    tokenExpiresAt: Date;
    status: SwiggyConnectionStatus;
  }): Promise<void>;
}
