import { getIdentityProvider } from "@/lib/server/auth";
import { samlServiceProvider } from "@/lib/auth/saml";

export async function GET(_request: Request, { params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  const provider = await getIdentityProvider(providerId);
  if (!provider || provider.kind !== "saml") return new Response("Provider not found", { status: 404 });
  return new Response(samlServiceProvider(provider).generateServiceProviderMetadata(null), {
    headers: { "Content-Type": "application/samlmetadata+xml; charset=utf-8" },
  });
}
