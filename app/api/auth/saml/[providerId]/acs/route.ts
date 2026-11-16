import { NextResponse } from "next/server";
import { completeSamlLogin } from "@/lib/auth/saml";
import { createSession } from "@/lib/auth/session";
import { getIdentityProvider } from "@/lib/server/auth";

export async function POST(request: Request, { params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  const provider = await getIdentityProvider(providerId);
  if (!provider || !provider.enabled || provider.kind !== "saml") return new Response("Provider not found", { status: 404 });
  try {
    const form = await request.formData();
    const values = Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
    const { userId, returnTo } = await completeSamlLogin(provider, values);
    await createSession(userId);
    return NextResponse.redirect(new URL(returnTo, request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign-in could not be completed.";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, request.url), 303);
  }
}
