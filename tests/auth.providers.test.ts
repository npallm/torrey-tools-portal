import { describe, expect, it } from "vitest";
import type { IdentityProvider } from "@/lib/server/auth";
import { mapOidcClaims, oidcIssuer, validateGoogleHostedDomain } from "@/lib/auth/oidc";
import { mapSamlProfile } from "@/lib/auth/saml";

const provider: IdentityProvider = {
  id: "provider-id",
  organization_id: "org-id",
  kind: "google",
  display_name: "Workspace",
  enabled: true,
  email_domains: ["example.com"],
  oidc_issuer: null,
  oidc_client_id: "client",
  oidc_client_secret_env: "OIDC_SECRET",
  saml_entry_point: null,
  saml_idp_issuer: null,
  saml_idp_cert: null,
  jit_provisioning: false,
  default_role: "employee",
  created_at: "",
  updated_at: "",
};

describe("identity provider claim mapping", () => {
  it("maps OIDC email and subject and enforces Google hosted domains", () => {
    expect(mapOidcClaims({ email: "Person@Example.com", sub: "subject", hd: "example.com" }))
      .toEqual({ email: "person@example.com", subject: "subject", hostedDomain: "example.com" });
    expect(() => mapOidcClaims({ email: "person@example.com" })).toThrow(/email and subject/);
    expect(() => validateGoogleHostedDomain(provider, "EXAMPLE.COM")).not.toThrow();
    expect(() => validateGoogleHostedDomain(provider, "other.com")).toThrow(/Workspace domain/);
    expect(() => validateGoogleHostedDomain(provider, null)).toThrow(/Workspace domain/);
  });

  it("maps SAML NameID/email attributes without calling an identity provider", () => {
    const mapped = mapSamlProfile({
      nameID: "person@example.com",
      email: "person@example.com",
    } as never);
    expect(mapped).toEqual({ email: "person@example.com", subject: "person@example.com" });
  });

  it("requires HTTPS for configured OIDC issuers", () => {
    expect(oidcIssuer({ ...provider, kind: "oidc", oidc_issuer: "https://id.example.com" }))
      .toBe("https://id.example.com");
    expect(() => oidcIssuer({ ...provider, kind: "oidc", oidc_issuer: "http://id.example.com" }))
      .toThrow(/HTTPS/);
  });
});
