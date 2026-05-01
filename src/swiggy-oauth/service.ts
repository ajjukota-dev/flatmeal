import { encryptSecret, randomBase64Url, sha256Base64Url, timingSafeStringEqual } from "../crypto/secrets.js";
import type { AppEnv } from "../config/env.js";
import type { SwiggyOAuthRepository } from "./repository.js";

const accessTokenLifetimeSeconds = 432000;
const authorizationCodeLifetimeMs = 120000;

export class SwiggyOAuthService {
  constructor(
    private readonly repository: SwiggyOAuthRepository,
    private readonly env: Pick<
      AppEnv,
      "ENCRYPTION_SECRET" | "FAKE_SWIGGY_CLIENT_ID" | "FAKE_SWIGGY_OAUTH_BASE_URL" | "FAKE_SWIGGY_OAUTH_CALLBACK_URL"
    >,
  ) {}

  async createAuthorizationRequest(input: { householdId: string; ownerMemberId: string }): Promise<{
    authorizationUrl: string;
    codeVerifier: string;
  }> {
    const isOwner = await this.repository.isOwnerMember(input);
    if (!isOwner) {
      throw new Error("Only the household owner can connect Swiggy");
    }

    const state = randomBase64Url();
    const codeVerifier = randomBase64Url();
    const codeChallenge = sha256Base64Url(codeVerifier);
    await this.repository.createOAuthSession({
      householdId: input.householdId,
      ownerMemberId: input.ownerMemberId,
      stateHash: sha256Base64Url(state),
      codeVerifierHash: sha256Base64Url(codeVerifier),
      redirectUri: this.env.FAKE_SWIGGY_OAUTH_CALLBACK_URL,
      expiresAt: new Date(Date.now() + authorizationCodeLifetimeMs),
    });

    const authorizeUrl = new URL(
      `${this.env.FAKE_SWIGGY_OAUTH_BASE_URL.replace(/\/$/, "")}/auth/authorize`,
    );
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", this.env.FAKE_SWIGGY_CLIENT_ID);
    authorizeUrl.searchParams.set("redirect_uri", this.env.FAKE_SWIGGY_OAUTH_CALLBACK_URL);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("scope", "mcp:tools");

    return { authorizationUrl: authorizeUrl.toString(), codeVerifier };
  }

  async authorize(input: {
    responseType: string;
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    state: string;
    scope: string;
  }): Promise<string> {
    if (input.responseType !== "code") {
      throw new Error("Unsupported response_type");
    }
    if (input.clientId !== this.env.FAKE_SWIGGY_CLIENT_ID) {
      throw new Error("Invalid client_id");
    }
    if (input.redirectUri !== this.env.FAKE_SWIGGY_OAUTH_CALLBACK_URL) {
      throw new Error("Invalid redirect_uri");
    }
    if (input.codeChallengeMethod !== "S256") {
      throw new Error("Invalid code_challenge_method");
    }
    if (input.scope !== "mcp:tools") {
      throw new Error("Invalid scope");
    }

    const session = await this.repository.findOAuthSessionByStateHash(sha256Base64Url(input.state));
    if (!session || session.consumedAt || new Date(session.expiresAt).getTime() <= Date.now()) {
      throw new Error("Invalid or expired OAuth state");
    }
    if (!timingSafeStringEqual(session.codeVerifierHash, input.codeChallenge)) {
      throw new Error("Invalid PKCE challenge");
    }

    const code = randomBase64Url(24);
    await this.repository.attachAuthorizationCode({
      sessionId: session.id,
      codeHash: sha256Base64Url(code),
    });

    const callbackUrl = new URL(input.redirectUri);
    callbackUrl.searchParams.set("code", code);
    callbackUrl.searchParams.set("state", input.state);
    return callbackUrl.toString();
  }

  async exchangeCode(input: {
    grantType: string;
    code: string;
    codeVerifier: string;
    clientId: string;
    redirectUri: string;
  }): Promise<{ access_token: string; token_type: "Bearer"; expires_in: number; scope: string }> {
    if (input.grantType !== "authorization_code") {
      throw new Error("Unsupported grant_type");
    }
    if (input.clientId !== this.env.FAKE_SWIGGY_CLIENT_ID) {
      throw new Error("Invalid client_id");
    }
    if (input.redirectUri !== this.env.FAKE_SWIGGY_OAUTH_CALLBACK_URL) {
      throw new Error("Invalid redirect_uri");
    }

    const session = await this.repository.findOAuthSessionByCodeHash(sha256Base64Url(input.code));
    if (!session || session.consumedAt || new Date(session.expiresAt).getTime() <= Date.now()) {
      throw new Error("Invalid or expired authorization code");
    }
    if (!timingSafeStringEqual(session.codeVerifierHash, sha256Base64Url(input.codeVerifier))) {
      throw new Error("Invalid code verifier");
    }

    const accessToken = `fake-swiggy-${randomBase64Url(24)}`;
    const tokenExpiresAt = new Date(Date.now() + accessTokenLifetimeSeconds * 1000);
    await this.repository.upsertSwiggyConnection({
      householdId: session.householdId,
      ownerMemberId: session.ownerMemberId,
      encryptedAccessToken: encryptSecret(accessToken, this.env.ENCRYPTION_SECRET),
      tokenExpiresAt,
      status: "connected",
    });
    await this.repository.consumeOAuthSession(session.id);

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: accessTokenLifetimeSeconds,
      scope: "mcp:tools",
    };
  }
}
