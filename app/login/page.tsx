import { PageHeader } from "@/components/PageHeader";
import { getDevelopmentUsers } from "@/lib/server/auth";
import { sanitizeReturnTo } from "@/lib/auth/redirect";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; loggedOut?: string }>;
}) {
  const query = await searchParams;
  const next = sanitizeReturnTo(query.next);
  const demoUsers = await getDevelopmentUsers();
  const groups = new Map<string, typeof demoUsers>();
  for (const user of demoUsers) {
    const group = groups.get(user.role) ?? [];
    group.push(user);
    groups.set(user.role, group);
  }
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Sign in" subtitle="Use your organization’s identity provider." />
      {query.error && <p role="alert" className="mb-4 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{query.error}</p>}
      {query.loggedOut && <p className="mb-4 rounded border bg-white p-3 text-sm">You have signed out.</p>}
      <form action="/api/auth/discover" method="post" className="space-y-3 rounded-lg border bg-white p-5">
        <label className="block text-sm font-medium">
          Work email
          <input name="email" type="email" autoComplete="username" required className="mt-1 block w-full rounded border p-2" />
        </label>
        <input type="hidden" name="next" value={next} />
        <button className="rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white">Continue</button>
      </form>
      {!!demoUsers.length && (
        <section className="mt-6 rounded-lg border bg-white p-5">
          <h2 className="font-semibold">Development demo sign-in</h2>
          <p className="mt-1 text-sm text-slate-500">Local development only.</p>
          {[...groups].map(([role, users]) => (
            <div key={role} className="mt-4">
              <h3 className="text-sm font-medium capitalize">{role.replace("_", " ")}</h3>
              <ul className="mt-2 space-y-2">
                {users.map((user) => (
                  <li key={user.id}>
                    <form action="/api/auth/dev-login" method="post" className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm">{user.display_name ?? user.email} · {user.email}</span>
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="next" value={next} />
                      <button className="rounded border px-3 py-1 text-xs">Sign in</button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
