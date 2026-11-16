"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { saveIdentityProvider } from "@/lib/server/auth";

export async function saveSsoProviderAction(formData: FormData) {
  const user = await requireRole("client_admin", "consultant");
  try {
    await saveIdentityProvider(user.organizationId, {
      id: String(formData.get("id") ?? "") || undefined,
      kind: String(formData.get("kind") ?? "oidc") as "okta" | "entra" | "google" | "oidc" | "saml",
      display_name: String(formData.get("displayName") ?? ""),
      enabled: formData.get("enabled") === "on",
      email_domains: String(formData.get("emailDomains") ?? "").split(",").map((value) => value.trim()).filter(Boolean),
      oidc_issuer: String(formData.get("oidcIssuer") ?? "") || null,
      oidc_client_id: String(formData.get("oidcClientId") ?? "") || null,
      oidc_client_secret_env: String(formData.get("oidcClientSecretEnv") ?? "") || null,
      saml_entry_point: String(formData.get("samlEntryPoint") ?? "") || null,
      saml_idp_issuer: String(formData.get("samlIdpIssuer") ?? "") || null,
      saml_idp_cert: String(formData.get("samlIdpCert") ?? "") || null,
      jit_provisioning: formData.get("jitProvisioning") === "on",
      default_role: String(formData.get("defaultRole") ?? "employee") as "client_admin" | "manager" | "employee",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The identity provider could not be saved.";
    redirect(`/settings/sso?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/settings/sso");
  redirect("/settings/sso?saved=1");
}
