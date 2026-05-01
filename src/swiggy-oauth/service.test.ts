import { describe, expect, it } from "vitest";
import { decryptSecret } from "../crypto/secrets.js";
import type { OAuthSessionCreate, SwiggyOAuthRepository } from "./repository.js";
import { SwiggyOAuthService } from "./service.js";
import type { FakeOAuthSession, SwiggyConnectionStatus } from "./types.js";

class InMemoryOAuthRepository implements SwiggyOAuthRepository {
  sessions = new Map<string, FakeOAuthSession>();
  ownerMembers = new Set(["hh1:member1"]);
  connection?: {
    householdId: string;
    ownerMemberId: string;
    encryptedAccessToken: string;
    tokenExpiresAt: Date;
    status: SwiggyConnectionStatus;
  };

  async isOwnerMember(input: { householdId: string; ownerMemberId: string }): Promise<boolean> {
    return this.ownerMembers.has(`${input.householdId}:${input.ownerMemberId}`);
  }

  async createOAuthSession(input: OAuthSessionCreate): Promise<FakeOAuthSession> {
    const session = {
      id: `oauth-${this.sessions.size + 1}`,
      householdId: input.householdId,
      ownerMemberId: input.ownerMemberId,
      stateHash: input.stateHash,
      codeVerifierHash: input.codeVerifierHash,
      codeHash: null,
      redirectUri: input.redirectUri,
      expiresAt: input.expiresAt.toISOString(),
      consumedAt: null,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async findOAuthSessionByStateHash(stateHash: string): Promise<FakeOAuthSession | null> {
    return [...this.sessions.values()].find((session) => session.stateHash === stateHash) ?? null;
  }

  async findOAuthSessionByCodeHash(codeHash: string): Promise<FakeOAuthSession | null> {
    return [...this.sessions.values()].find((session) => session.codeHash === codeHash) ?? null;
  }

  async attachAuthorizationCode(input: { sessionId: string; codeHash: string }): Promise<void> {
    const session = this.sessions.get(input.sessionId);
    if (!session) throw new Error("missing session");
    session.codeHash = input.codeHash;
  }

  async consumeOAuthSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("missing session");
    session.consumedAt = new Date().toISOString();
  }

  async upsertSwiggyConnection(input: {
    householdId: string;
    ownerMemberId: string;
    encryptedAccessToken: string;
    tokenExpiresAt: Date;
    status: SwiggyConnectionStatus;
  }): Promise<void> {
    this.connection = input;
  }
}

const env = {
  ENCRYPTION_SECRET: "secret",
  FAKE_SWIGGY_CLIENT_ID: "flatmeal-local",
  FAKE_SWIGGY_OAUTH_BASE_URL: "http://localhost:3000/fake-swiggy",
  FAKE_SWIGGY_OAUTH_CALLBACK_URL: "http://localhost:3000/oauth/swiggy/callback",
};

describe("SwiggyOAuthService", () => {
  it("creates a fake PKCE authorization URL", async () => {
    const repository = new InMemoryOAuthRepository();
    const service = new SwiggyOAuthService(repository, env);

    const request = await service.createAuthorizationRequest({ householdId: "hh1", ownerMemberId: "member1" });
    const authUrl = new URL(request.authorizationUrl);

    expect(authUrl.origin + authUrl.pathname).toBe("http://localhost:3000/fake-swiggy/auth/authorize");
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authUrl.searchParams.get("scope")).toBe("mcp:tools");
    expect(authUrl.searchParams.get("code_verifier")).toBeNull();
    expect(request.codeVerifier).toBeTruthy();
    expect(repository.sessions.size).toBe(1);
  });

  it("authorizes and exchanges a single-use code for an encrypted fake token", async () => {
    const repository = new InMemoryOAuthRepository();
    const service = new SwiggyOAuthService(repository, env);
    const request = await service.createAuthorizationRequest({ householdId: "hh1", ownerMemberId: "member1" });
    const authUrl = new URL(request.authorizationUrl);
    const callbackUrl = new URL(
      await service.authorize({
        responseType: authUrl.searchParams.get("response_type") ?? "",
        clientId: authUrl.searchParams.get("client_id") ?? "",
        redirectUri: authUrl.searchParams.get("redirect_uri") ?? "",
        codeChallenge: authUrl.searchParams.get("code_challenge") ?? "",
        codeChallengeMethod: authUrl.searchParams.get("code_challenge_method") ?? "",
        state: authUrl.searchParams.get("state") ?? "",
        scope: authUrl.searchParams.get("scope") ?? "",
      }),
    );

    const token = await service.exchangeCode({
      grantType: "authorization_code",
      code: callbackUrl.searchParams.get("code") ?? "",
      codeVerifier: request.codeVerifier,
      clientId: env.FAKE_SWIGGY_CLIENT_ID,
      redirectUri: env.FAKE_SWIGGY_OAUTH_CALLBACK_URL,
    });

    expect(token).toMatchObject({ token_type: "Bearer", expires_in: 432000, scope: "mcp:tools" });
    expect(token.access_token).toMatch(/^fake-swiggy-/);
    expect(repository.connection?.status).toBe("connected");
    expect(repository.connection?.encryptedAccessToken).not.toContain(token.access_token);
    expect(decryptSecret(repository.connection?.encryptedAccessToken ?? "", env.ENCRYPTION_SECRET)).toBe(token.access_token);

    await expect(
      service.exchangeCode({
        grantType: "authorization_code",
        code: callbackUrl.searchParams.get("code") ?? "",
        codeVerifier: request.codeVerifier,
        clientId: env.FAKE_SWIGGY_CLIENT_ID,
        redirectUri: env.FAKE_SWIGGY_OAUTH_CALLBACK_URL,
      }),
    ).rejects.toThrow("Invalid or expired authorization code");
  });

  it("rejects mismatched PKCE verifier", async () => {
    const repository = new InMemoryOAuthRepository();
    const service = new SwiggyOAuthService(repository, env);
    const request = await service.createAuthorizationRequest({ householdId: "hh1", ownerMemberId: "member1" });
    const authUrl = new URL(request.authorizationUrl);

    const callbackUrl = new URL(
      await service.authorize({
        responseType: "code",
        clientId: env.FAKE_SWIGGY_CLIENT_ID,
        redirectUri: env.FAKE_SWIGGY_OAUTH_CALLBACK_URL,
        codeChallenge: authUrl.searchParams.get("code_challenge") ?? "",
        codeChallengeMethod: "S256",
        state: authUrl.searchParams.get("state") ?? "",
        scope: "mcp:tools",
      }),
    );

    await expect(
      service.exchangeCode({
        grantType: "authorization_code",
        code: callbackUrl.searchParams.get("code") ?? "",
        codeVerifier: "wrong",
        clientId: env.FAKE_SWIGGY_CLIENT_ID,
        redirectUri: env.FAKE_SWIGGY_OAUTH_CALLBACK_URL,
      }),
    ).rejects.toThrow("Invalid code verifier");
  });

  it("rejects OAuth start for non-owner members", async () => {
    const repository = new InMemoryOAuthRepository();
    const service = new SwiggyOAuthService(repository, env);

    await expect(
      service.createAuthorizationRequest({ householdId: "hh1", ownerMemberId: "member2" }),
    ).rejects.toThrow("Only the household owner can connect Swiggy");
  });
});
