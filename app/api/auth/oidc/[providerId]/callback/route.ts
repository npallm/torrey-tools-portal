import { NextResponse } from "next/server";
import { completeOidcLogin } from "@/lib/auth/oidc";
import { createSession } from "@/lib/auth/session";
import { getIdentityProvider } from "@/lib/server/auth";

export async function GET(request: Request, { params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  const provider = await getIdentityProvider(providerId);
  if (!provider || !provider.enabled || provider.kind === "saml") return new Response("Provider not found", { status: 404 });
  try {
    const { userId, returnTo } = await completeOidcLogin(provider, new URL(request.url));
    await createSession(userId);
    return NextResponse.redirect(new URL(returnTo, request.url));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign-in could not be completed.";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, request.url));
  }
}
