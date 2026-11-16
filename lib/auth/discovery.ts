export type DiscoverableProvider = {
  id: string;
  enabled: boolean;
  email_domains: string[];
};

export function providerForEmail<T extends DiscoverableProvider>(
  providers: T[],
  email: string,
): T | null {
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return providers.find(
    (provider) =>
      provider.enabled &&
      provider.email_domains.some((allowed) => allowed.trim().replace(/^@/, "").toLowerCase() === domain),
  ) ?? null;
}
