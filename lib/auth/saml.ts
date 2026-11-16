import { SAML, type Profile } from "@node-saml/node-saml";
import type { IdentityProvider } from "@/lib/server/auth";
import { providerForEmail } from "./discovery";
import { sanitizeReturnTo } from "./redirect";
import { resolvePortalUser } from "./provisioning";
import { consumeAuthRequest, createAuthRequest } from "@/lib/server/auth";

const appBaseUrl = () => (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export function samlEntityId(providerId: string) {
  return `${appBaseUrl()}/api/auth/saml/${providerId}/metadata`;
}

export function samlAcsUrl(providerId: string) {
  return `${appBaseUrl()}/api/auth/saml/${providerId}/acs`;
}

export function samlServiceProvider(provider: IdentityProvider) {
  if (provider.kind !== "saml" || !provider.saml_entry_point || !provider.saml_idp_issuer || !provider.saml_idp_cert) {
    throw new Error("SAML provider settings are incomplete.");
  }
  return new SAML({
    entryPoint: provider.saml_entry_point,
    issuer: samlEntityId(provider.id),
    callbackUrl: samlAcsUrl(provider.id),
    idpIssuer: provider.saml_idp_issuer,
    idpCert: provider.saml_idp_cert,
    wantAssertionsSigned: true,
  });
}

export async function beginSamlLogin(provider: IdentityProvider, returnTo?: string | null) {
  if (!provider.enabled || provider.kind !== "saml") throw new Error("SAML provider is not enabled.");
  const state = crypto.randomUUID();
  await createAuthRequest({ state, providerId: provider.id, nonce: null, codeVerifier: null, returnTo });
  return samlServiceProvider(provider).getAuthorizeUrlAsync(state, {});
}

export function mapSamlProfile(profile: Profile) {
  const attrs = profile as Profile & Record<string, unknown>;
  const values = [attrs.email, attrs.mail, attrs["urn:oid:0.9.2342.19200300.100.1.3"], attrs.nameID]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value): value is string => typeof value === "string" && value.includes("@"));
  const email = values[0]?.trim().toLowerCase() ?? "";
  const subject = typeof attrs.nameID === "string" ? attrs.nameID : email;
  if (!email || !subject) throw new Error("The identity provider did not return an email address.");
  return { email, subject };
}

export async function completeSamlLogin(provider: IdentityProvider, response: Record<string, string>) {
  const relayState = response.RelayState;
  if (!relayState) throw new Error("The sign-in request is invalid or expired.");
  const authRequest = await consumeAuthRequest(relayState);
  if (!authRequest || authRequest.provider_id !== provider.id) {
    throw new Error("The sign-in request is invalid or expired.");
  }
  const { profile, loggedOut } = await samlServiceProvider(provider).validatePostResponseAsync(response);
  if (loggedOut || !profile) throw new Error("The SAML response did not contain a sign-in.");
  const identity = mapSamlProfile(profile);
  if (!providerForEmail([provider], identity.email)) {
    throw new Error("No portal account for this email; ask your HR admin.");
  }
  const userId = await resolvePortalUser(
    provider.organization_id,
    provider.id,
    identity.subject,
    identity.email,
  );
  return { userId, returnTo: sanitizeReturnTo(authRequest.return_to) };
}
