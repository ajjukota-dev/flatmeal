import { Router } from "express";
import type { AppEnv } from "../config/env.js";
import type { SwiggyOAuthService } from "./service.js";

const verifierCookieName = "fm_fake_swiggy_code_verifier";

export function createSwiggyOAuthRouter(
  service: SwiggyOAuthService,
  env: Pick<AppEnv, "FAKE_SWIGGY_CLIENT_ID" | "FAKE_SWIGGY_OAUTH_CALLBACK_URL">,
): Router {
  const router = Router();

  router.get("/swiggy/connect/start", async (request, response, next) => {
    try {
      const householdId = readRequiredQuery(request.query.householdId);
      const ownerMemberId = readRequiredQuery(request.query.ownerMemberId);
      const auth = await service.createAuthorizationRequest({ householdId, ownerMemberId });

      response.cookie(verifierCookieName, auth.codeVerifier, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 120000,
      });
      response.redirect(auth.authorizationUrl);
    } catch (error) {
      next(error);
    }
  });

  router.get("/fake-swiggy/auth/authorize", async (request, response, next) => {
    try {
      const callbackUrl = await service.authorize({
        responseType: readRequiredQuery(request.query.response_type),
        clientId: readRequiredQuery(request.query.client_id),
        redirectUri: readRequiredQuery(request.query.redirect_uri),
        codeChallenge: readRequiredQuery(request.query.code_challenge),
        codeChallengeMethod: readRequiredQuery(request.query.code_challenge_method),
        state: readRequiredQuery(request.query.state),
        scope: readRequiredQuery(request.query.scope),
      });

      response.redirect(callbackUrl);
    } catch (error) {
      next(error);
    }
  });

  router.get("/oauth/swiggy/callback", async (request, response, next) => {
    try {
      const codeVerifier = readCookie(request.headers.cookie, verifierCookieName);
      if (!codeVerifier) {
        response.status(400).send("Missing local PKCE verifier. Restart Swiggy connect.");
        return;
      }

      await service.exchangeCode({
        grantType: "authorization_code",
        code: readRequiredQuery(request.query.code),
        codeVerifier,
        clientId: env.FAKE_SWIGGY_CLIENT_ID,
        redirectUri: env.FAKE_SWIGGY_OAUTH_CALLBACK_URL,
      });

      response.clearCookie(verifierCookieName);
      response.type("html").send("<!doctype html><title>Swiggy connected</title><p>Swiggy connected. You can return to Telegram.</p>");
    } catch (error) {
      next(error);
    }
  });

  router.post("/fake-swiggy/auth/token", async (request, response, next) => {
    try {
      const token = await service.exchangeCode({
        grantType: String(request.body.grant_type ?? ""),
        code: String(request.body.code ?? ""),
        codeVerifier: String(request.body.code_verifier ?? ""),
        clientId: String(request.body.client_id ?? ""),
        redirectUri: String(request.body.redirect_uri ?? ""),
      });
      response.json(token);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function readRequiredQuery(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Missing required OAuth query parameter");
  }
  return value;
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) {
    return null;
  }

  const match = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}
