import type { SupabaseClient } from "@supabase/supabase-js";
import type { OAuthSessionCreate, SwiggyOAuthRepository } from "./repository.js";
import type { FakeOAuthSession, SwiggyConnectionStatus } from "./types.js";

export class SupabaseSwiggyOAuthRepository implements SwiggyOAuthRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async isOwnerMember(input: { householdId: string; ownerMemberId: string }): Promise<boolean> {
    const result = await this.supabase
      .from("household_members")
      .select("id")
      .eq("id", input.ownerMemberId)
      .eq("household_id", input.householdId)
      .eq("role", "owner")
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    return Boolean(result.data);
  }

  async createOAuthSession(input: OAuthSessionCreate): Promise<FakeOAuthSession> {
    const result = await this.supabase
      .from("oauth_sessions")
      .insert({
        household_id: input.householdId,
        owner_member_id: input.ownerMemberId,
        state_hash: input.stateHash,
        code_verifier_hash: input.codeVerifierHash,
        redirect_uri: input.redirectUri,
        expires_at: input.expiresAt.toISOString(),
      })
      .select("id, household_id, owner_member_id, state_hash, code_verifier_hash, code_hash, redirect_uri, expires_at, consumed_at")
      .single();

    if (result.error) {
      throw result.error;
    }

    return toOAuthSession(result.data);
  }

  async findOAuthSessionByStateHash(stateHash: string): Promise<FakeOAuthSession | null> {
    const result = await this.supabase
      .from("oauth_sessions")
      .select("id, household_id, owner_member_id, state_hash, code_verifier_hash, code_hash, redirect_uri, expires_at, consumed_at")
      .eq("state_hash", stateHash)
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    return result.data ? toOAuthSession(result.data) : null;
  }

  async findOAuthSessionByCodeHash(codeHash: string): Promise<FakeOAuthSession | null> {
    const result = await this.supabase
      .from("oauth_sessions")
      .select("id, household_id, owner_member_id, state_hash, code_verifier_hash, code_hash, redirect_uri, expires_at, consumed_at")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    return result.data ? toOAuthSession(result.data) : null;
  }

  async attachAuthorizationCode(input: { sessionId: string; codeHash: string }): Promise<void> {
    const result = await this.supabase
      .from("oauth_sessions")
      .update({ code_hash: input.codeHash })
      .eq("id", input.sessionId)
      .is("code_hash", null);

    if (result.error) {
      throw result.error;
    }
  }

  async consumeOAuthSession(sessionId: string): Promise<void> {
    const result = await this.supabase
      .from("oauth_sessions")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", sessionId)
      .is("consumed_at", null);

    if (result.error) {
      throw result.error;
    }
  }

  async upsertSwiggyConnection(input: {
    householdId: string;
    ownerMemberId: string;
    encryptedAccessToken: string;
    tokenExpiresAt: Date;
    status: SwiggyConnectionStatus;
  }): Promise<void> {
    const result = await this.supabase.from("swiggy_connections").upsert(
      {
        household_id: input.householdId,
        owner_member_id: input.ownerMemberId,
        mode: "fake",
        status: input.status,
        encrypted_access_token: input.encryptedAccessToken,
        token_expires_at: input.tokenExpiresAt.toISOString(),
        connected_at: new Date().toISOString(),
      },
      { onConflict: "household_id" },
    );

    if (result.error) {
      throw result.error;
    }
  }
}

function toOAuthSession(row: {
  id: string;
  household_id: string;
  owner_member_id: string;
  state_hash: string;
  code_verifier_hash: string;
  code_hash: string | null;
  redirect_uri: string;
  expires_at: string;
  consumed_at: string | null;
}): FakeOAuthSession {
  return {
    id: row.id,
    householdId: row.household_id,
    ownerMemberId: row.owner_member_id,
    stateHash: row.state_hash,
    codeVerifierHash: row.code_verifier_hash,
    codeHash: row.code_hash,
    redirectUri: row.redirect_uri,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  };
}
