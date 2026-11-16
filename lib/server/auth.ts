import { getPool } from "@/lib/db";
import { sanitizeReturnTo } from "@/lib/auth/redirect";

export type IdentityProvider = {
  id: string;
  organization_id: string;
  kind: "okta" | "entra" | "google" | "oidc" | "saml";
  display_name: string;
  enabled: boolean;
  email_domains: string[];
  oidc_issuer: string | null;
  oidc_client_id: string | null;
  oidc_client_secret_env: string | null;
  saml_entry_point: string | null;
  saml_idp_issuer: string | null;
  saml_idp_cert: string | null;
  jit_provisioning: boolean;
  default_role: "client_admin" | "manager" | "employee";
  created_at: string;
  updated_at: string;
};

export type IdentityProviderInput = Omit<
  IdentityProvider,
  "id" | "organization_id" | "created_at" | "updated_at"
> & { id?: string };

export async function getIdentityProviders(organizationId: string) {
  const result = await getPool().query<IdentityProvider>(
    `select * from identity_providers where organization_id = $1 order by display_name, id`,
    [organizationId],
  );
  return result.rows;
}

export async function getEnabledIdentityProviders() {
  const result = await getPool().query<IdentityProvider>(
    "select * from identity_providers where enabled order by display_name, id",
  );
  return result.rows;
}

export async function getIdentityProvider(providerId: string) {
  const result = await getPool().query<IdentityProvider>(
    "select * from identity_providers where id = $1",
    [providerId],
  );
  return result.rows[0] ?? null;
}

export function validateIdentityProvider(input: IdentityProviderInput) {
  if (!input.display_name.trim()) return "Enter a provider name.";
  if (input.enabled && !input.email_domains.length) return "Add at least one email domain before enabling this provider.";
  if (!input.enabled) return null;
  if (input.kind === "saml") {
    if (!input.saml_entry_point?.trim() || !input.saml_idp_issuer?.trim() || !input.saml_idp_cert?.trim()) {
      return "SAML requires an entry point, IdP issuer, and IdP certificate before it can be enabled.";
    }
    return null;
  }
  if (!input.oidc_client_id?.trim() || !input.oidc_client_secret_env?.trim()) {
    return "OIDC requires a client ID and client-secret environment variable name before it can be enabled.";
  }
  if (input.kind !== "google" && !input.oidc_issuer?.trim()) {
    return "Enter an OIDC issuer before enabling this provider.";
  }
  return null;
}

export async function saveIdentityProvider(organizationId: string, input: IdentityProviderInput) {
  const validationError = validateIdentityProvider(input);
  if (validationError) throw new Error(validationError);
  const domains = [...new Set(input.email_domains.map((domain) => domain.trim().replace(/^@/, "").toLowerCase()).filter(Boolean))];
  const values = [
    input.kind,
    input.display_name.trim(),
    input.enabled,
    domains,
    input.oidc_issuer?.trim() || null,
    input.oidc_client_id?.trim() || null,
    input.oidc_client_secret_env?.trim() || null,
    input.saml_entry_point?.trim() || null,
    input.saml_idp_issuer?.trim() || null,
    input.saml_idp_cert?.trim() || null,
    input.jit_provisioning,
    input.default_role,
  ];
  if (input.id) {
    const result = await getPool().query(
      `update identity_providers
       set kind=$1, display_name=$2, enabled=$3, email_domains=$4,
           oidc_issuer=$5, oidc_client_id=$6, oidc_client_secret_env=$7,
           saml_entry_point=$8, saml_idp_issuer=$9, saml_idp_cert=$10,
           jit_provisioning=$11, default_role=$12, updated_at=now()
       where id=$13 and organization_id=$14 returning id`,
      [...values, input.id, organizationId],
    );
    if (!result.rowCount) throw new Error("Identity provider not found.");
    return input.id;
  }
  const result = await getPool().query<{ id: string }>(
    `insert into identity_providers
       (organization_id, kind, display_name, enabled, email_domains,
        oidc_issuer, oidc_client_id, oidc_client_secret_env,
        saml_entry_point, saml_idp_issuer, saml_idp_cert, jit_provisioning, default_role)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     returning id`,
    [organizationId, ...values],
  );
  return result.rows[0].id;
}

export async function getDevelopmentUsers() {
  if (process.env.NODE_ENV === "production" || process.env.AUTH_DEV_LOGIN !== "true") return [];
  const result = await getPool().query<{
    id: string;
    email: string;
    display_name: string | null;
    role: "consultant" | "client_admin" | "manager" | "employee";
  }>(
    `select u.id, u.email, u.display_name, u.role
     from portal_users u join organizations o on o.id = u.organization_id
     where o.slug = 'demo' and u.is_active
     order by case u.role when 'client_admin' then 1 when 'manager' then 2 when 'employee' then 3 else 4 end,
              u.display_name nulls last, u.email`,
  );
  return result.rows;
}

export async function createAuthRequest(input: {
  state: string;
  providerId: string;
  nonce: string | null;
  codeVerifier: string | null;
  returnTo: string | null | undefined;
}) {
  await getPool().query(
    `insert into auth_requests (state, provider_id, nonce, code_verifier, return_to, expires_at)
     values ($1,$2,$3,$4,$5,now() + interval '10 minutes')`,
    [
      input.state,
      input.providerId,
      input.nonce,
      input.codeVerifier,
      sanitizeReturnTo(input.returnTo),
    ],
  );
}

export async function consumeAuthRequest(state: string) {
  const result = await getPool().query<{
    state: string;
    provider_id: string;
    nonce: string | null;
    code_verifier: string | null;
    return_to: string;
    expires_at: Date;
  }>(
    `delete from auth_requests where state=$1
     returning state, provider_id, nonce, code_verifier, return_to, expires_at`,
    [state],
  );
  const request = result.rows[0];
  if (!request || request.expires_at.getTime() <= Date.now()) return null;
  return request;
}
