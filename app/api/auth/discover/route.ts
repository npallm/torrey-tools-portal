import { NextResponse } from "next/server";
import { providerForEmail } from "@/lib/auth/discovery";
import { sanitizeReturnTo } from "@/lib/auth/redirect";
import { getEnabledIdentityProviders } from "@/lib/server/auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const next = sanitizeReturnTo(String(form.get("next") ?? ""));
  const provider = providerForEmail(await getEnabledIdentityProviders(), email);
  if (!provider) {
    const error = "No portal account for this email; ask your HR admin.";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}&next=${encodeURIComponent(next)}`, request.url), 303);
  }
  const protocol = provider.kind === "saml" ? "saml" : "oidc";
  return NextResponse.redirect(
    new URL(`/api/auth/${protocol}/${provider.id}/start?next=${encodeURIComponent(next)}`, request.url),
    303,
  );
}
