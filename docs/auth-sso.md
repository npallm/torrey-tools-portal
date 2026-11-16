# Authentication and SSO setup

The portal supports organization-scoped OpenID Connect (OIDC) providers, including Okta, Microsoft Entra ID and Google Workspace, plus generic SAML 2.0 providers. Identity-provider client secrets are not stored in Postgres.

## Local development sign-in

Copy `.env.example` to `.env.local`. `AUTH_DEV_LOGIN=true` enables seeded demo-account buttons only when `NODE_ENV` is not `production`. The dev-login endpoint independently rejects production requests. Do not enable this option in a deployed environment.

## Okta (OIDC web application)

1. In Okta, create an **OIDC - OpenID Connect / Web Application** integration.
2. Set the sign-in redirect URI to `https://your-portal.example.com/api/auth/oidc/{provider-id}/callback`. Copy the provider ID from `/settings/sso` after saving the provider.
3. Add the organization's email domain to the provider's **Email domains**.
4. In `/settings/sso`, create an Okta provider with its issuer URL (for example `https://acme.okta.com` or a custom authorization-server issuer), client ID, and a secret environment-variable name such as `SSO_OKTA_CLIENT_SECRET`.
5. Put the actual client secret in the deployment's secret store under that exact environment-variable name. Never paste the secret into the settings form or store it in the database.

## Microsoft Entra ID

1. Create an app registration and configure its platform as **Web**.
2. Add `https://your-portal.example.com/api/auth/oidc/{provider-id}/callback` as a redirect URI.
3. Create a client secret in Entra and store its value in the deployment's secret store.
4. In `/settings/sso`, use kind **Entra**, enter the issuer `https://login.microsoftonline.com/{tenant-id}/v2.0`, the application (client) ID, the secret environment-variable name, and the organization's email domain.
5. Enable the provider after all required settings are saved.

## Google Workspace

1. Create an OAuth client ID with application type **Web application**.
2. Add `https://your-portal.example.com/api/auth/oidc/{provider-id}/callback` as an authorized redirect URI.
3. In `/settings/sso`, create a **Google Workspace** provider with the client ID, secret environment-variable name, and the Workspace email domain. Google discovery uses `https://accounts.google.com`.
4. Store the OAuth client secret in the deployment's secret store. The callback also checks Google's `hd` claim against the configured email domain.

## Generic SAML 2.0

1. In `/settings/sso`, create a SAML provider and enter the IdP entry-point URL, IdP issuer, signing certificate, and allowed email domain.
2. Save the provider. Copy its **ACS URL**, **entity ID**, and **SP metadata** link from the saved configuration into the identity provider:
   - ACS: `https://your-portal.example.com/api/auth/saml/{provider-id}/acs`
   - Entity ID: `https://your-portal.example.com/api/auth/saml/{provider-id}/metadata`
3. Configure the IdP's NameID format or an email attribute to provide the user's email address. The portal requires signed SAML assertions.
4. The SAML metadata endpoint publishes the service-provider entity ID and ACS URL. No OIDC client secret is used for SAML.

## Just-in-time provisioning

JIT provisioning is off by default. When enabled for a provider, a successful sign-in that does not match an existing identity or active portal user creates a portal user using the configured default role. If a worker has a matching work email in the same organization, the new portal user is linked to that worker. Otherwise, the portal user is created without a worker association. Existing identities and active users matched by email are linked before JIT is considered.

Configure only trusted email domains. The first successful sign-in for an unrecognized email can create a user when JIT is enabled.
