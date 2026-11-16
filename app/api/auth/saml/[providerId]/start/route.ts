import { NextResponse } from "next/server";
import { beginSamlLogin } from "@/lib/auth/saml";
import { sanitizeReturnTo } from "@/lib/auth/redirect";
import { getIdentityProvider } from "@/lib/server/auth";

export async function GET(request: Request, { params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  const provider = await getIdentityProvider(providerId);
  if (!provider || !provider.enabled || provider.kind !== "saml") return new Response("Provider not found", { status: 404 });
  try {
    const url = await beginSamlLogin(provider, sanitizeReturnTo(new URL(request.url).searchParams.get("next")));
    return NextResponse.redirect(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign-in could not be started.";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, request.url));
  }
}
