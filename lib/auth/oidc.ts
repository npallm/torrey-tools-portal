import * as oidc from "openid-client";
import type { IdentityProvider } from "@/lib/server/auth";
import { providerForEmail } from "./discovery";
import { sanitizeReturnTo } from "./redirect";
import { resolvePortalUser } from "./provisioning";
import { consumeAuthRequest, createAuthRequest } from "@/lib/server/auth";

export function oidcIssuer(provider: IdentityProvider) {
  if (provider.kind === "google") return "https://accounts.google.com";
  const issuer = provider.oidc_issuer?.trim();
  if (!issuer) throw new Error("OIDC issuer is not configured.");
  const url = new URL(issuer);
  if (url.protocol !== "https:") throw new Error("OIDC issuer must use HTTPS.");
  return url.href.replace(/\/$/, "");
}

async function oidcConfiguration(provider: IdentityProvider) {
  if (!provider.oidc_client_id || !provider.oidc_client_secret_env) {
    throw new Error("OIDC client settings are incomplete.");
  }
  const secret = process.env[provider.oidc_client_secret_env];
  if (!secret) throw new Error(`Set ${provider.oidc_client_secret_env} in the deployment secret store.`);
  return oidc.discovery(
    new URL(oidcIssuer(provider)),
    provider.oidc_client_id,
    { client_secret: secret },
  );
}

export async function beginOidcLogin(provider: IdentityProvider, returnTo?: string | null) {
  if (!provider.enabled || provider.kind === "saml") throw new Error("OIDC provider is not enabled.");
  const config = await oidcConfiguration(provider);
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  await createAuthRequest({
    providerId: provider.id,
    state,
    nonce,
    codeVerifier,
    returnTo,
  });
  const callback = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/api/auth/oidc/${provider.id}/callback`;
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callback,
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });
  return url;
}

export function mapOidcClaims(claims: Record<string, unknown>) {
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  const subject = typeof claims.sub === "string" ? claims.sub : "";
  if (!email || !subject) throw new Error("The identity provider did not return an email and subject.");
  return { email, subject, hostedDomain: typeof claims.hd === "string" ? claims.hd : null };
}

export function validateGoogleHostedDomain(provider: IdentityProvider, hostedDomain: string | null) {
  if (provider.kind !== "google" || !provider.email_domains.length) return;
  if (!hostedDomain || !provider.email_domains.some((domain) => domain.toLowerCase() === hostedDomain.toLowerCase())) {
    throw new Error("The Google account is outside the configured Workspace domain.");
  }
}

export async function completeOidcLogin(
  provider: IdentityProvider,
  callbackUrl: URL,
) {
  const state = callbackUrl.searchParams.get("state");
  if (!state) throw new Error("The sign-in request is invalid or expired.");
  const authRequest = await consumeAuthRequest(state);
  if (!authRequest || authRequest.provider_id !== provider.id || !authRequest.nonce || !authRequest.code_verifier) {
    throw new Error("The sign-in request is invalid or expired.");
  }
  const config = await oidcConfiguration(provider);
  const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
    expectedState: authRequest.state,
    expectedNonce: authRequest.nonce,
    pkceCodeVerifier: authRequest.code_verifier,
  });
  const claims = tokens.claims();
  if (!claims) throw new Error("The identity provider did not return an ID token.");
  const identity = mapOidcClaims(claims as Record<string, unknown>);
  validateGoogleHostedDomain(provider, identity.hostedDomain);
  if (!providerForEmail([provider], identity.email)) {
    throw new Error("No portal account for this email; ask your HR admin.");
  }
  if (provider.kind === "google" && provider.email_domains.length) {
    const allowedDomains = provider.email_domains.map((domain) => domain.trim().replace(/^@/, "").toLowerCase());
    if (!identity.hostedDomain || !allowedDomains.includes(identity.hostedDomain.toLowerCase())) {
      throw new Error("The Google Workspace domain does not match this provider.");
    }
  }
  const userId = await resolvePortalUser(
    provider.organization_id,
    provider.id,
    identity.subject,
    identity.email,
  );
  return { userId, returnTo: sanitizeReturnTo(authRequest.return_to) };
}
