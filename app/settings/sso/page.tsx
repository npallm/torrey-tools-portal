import { PageHeader } from "@/components/PageHeader";
import { requireRole } from "@/lib/auth/session";
import { getIdentityProviders, type IdentityProvider } from "@/lib/server/auth";
import { saveSsoProviderAction } from "./actions";

export const dynamic = "force-dynamic";

const baseUrl = () => (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

function ProviderForm({ provider }: { provider?: IdentityProvider }) {
  const id = provider?.id;
  return (
    <form action={saveSsoProviderAction} className="space-y-4 rounded-lg border bg-white p-5">
      {id && <input type="hidden" name="id" value={id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Provider name
          <input name="displayName" required defaultValue={provider?.display_name ?? ""} className="mt-1 block w-full rounded border p-2" />
        </label>
        <label className="text-sm">Provider type
          <select name="kind" defaultValue={provider?.kind ?? "oidc"} className="mt-1 block w-full rounded border p-2">
            {["okta", "entra", "google", "oidc", "saml"].map((kind) => <option key={kind} value={kind}>{kind.toUpperCase()}</option>)}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">Email domains (comma-separated)
          <input name="emailDomains" required defaultValue={provider?.email_domains.join(", ") ?? ""} placeholder="example.com" className="mt-1 block w-full rounded border p-2" />
        </label>
      </div>
      <fieldset className="grid gap-3 rounded border p-3 sm:grid-cols-2">
        <legend className="px-1 text-sm font-medium">OIDC settings (Okta, Entra, Google, generic OIDC)</legend>
        <label className="text-sm sm:col-span-2">Issuer URL
          <input name="oidcIssuer" defaultValue={provider?.oidc_issuer ?? ""} placeholder="https://issuer.example.com" className="mt-1 block w-full rounded border p-2" />
        </label>
        <label className="text-sm">Client ID
          <input name="oidcClientId" defaultValue={provider?.oidc_client_id ?? ""} className="mt-1 block w-full rounded border p-2" />
        </label>
        <label className="text-sm">Client secret environment variable name
          <input name="oidcClientSecretEnv" defaultValue={provider?.oidc_client_secret_env ?? ""} placeholder="SSO_OKTA_CLIENT_SECRET" className="mt-1 block w-full rounded border p-2" />
        </label>
        {id && <p className="text-xs text-slate-600 sm:col-span-2">Redirect URI: <code>{baseUrl()}/api/auth/oidc/{id}/callback</code></p>}
      </fieldset>
      <fieldset className="grid gap-3 rounded border p-3">
        <legend className="px-1 text-sm font-medium">SAML 2.0 settings</legend>
        <label className="text-sm">IdP entry point
          <input name="samlEntryPoint" defaultValue={provider?.saml_entry_point ?? ""} placeholder="https://idp.example.com/sso" className="mt-1 block w-full rounded border p-2" />
        </label>
        <label className="text-sm">IdP issuer
          <input name="samlIdpIssuer" defaultValue={provider?.saml_idp_issuer ?? ""} className="mt-1 block w-full rounded border p-2" />
        </label>
        <label className="text-sm sm:col-span-2">IdP signing certificate
          <textarea name="samlIdpCert" defaultValue={provider?.saml_idp_cert ?? ""} rows={4} className="mt-1 block w-full rounded border p-2" />
        </label>
        {id && (
          <div className="space-y-1 text-xs text-slate-600">
            <p>ACS URL: <code>{baseUrl()}/api/auth/saml/{id}/acs</code></p>
            <p>Entity ID: <code>{baseUrl()}/api/auth/saml/{id}/metadata</code></p>
            <p>SP metadata: <a className="text-brand-700 underline" href={`/api/auth/saml/${id}/metadata`}>/api/auth/saml/{id}/metadata</a></p>
          </div>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={provider?.enabled ?? false} />Enabled</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="jitProvisioning" defaultChecked={provider?.jit_provisioning ?? false} />Allow JIT provisioning</label>
        <label className="text-sm">JIT default role
          <select name="defaultRole" defaultValue={provider?.default_role ?? "employee"} className="ml-2 rounded border p-2">
            <option value="employee">Employee</option><option value="manager">Manager</option><option value="client_admin">Client admin</option>
          </select>
        </label>
        <button className="rounded bg-brand-700 px-4 py-2 text-sm text-white">Save provider</button>
      </div>
    </form>
  );
}

export default async function SsoSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await requireRole("client_admin", "consultant");
  const [providers, query] = await Promise.all([getIdentityProviders(user.organizationId), searchParams]);
  return (
    <div className="space-y-6">
      <PageHeader title="Single sign-on" subtitle="Configure identity providers for this organization." />
      {query.error && <p role="alert" className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{query.error}</p>}
      {query.saved && <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Provider saved.</p>}
      {providers.map((provider) => <ProviderForm key={provider.id} provider={provider} />)}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Add provider</h2>
        <ProviderForm />
      </section>
    </div>
  );
}
