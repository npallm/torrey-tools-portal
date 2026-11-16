import { getPool } from "@/lib/db";

const noAccount = "No portal account for this email; ask your HR admin.";

export async function resolvePortalUser(
  organizationId: string,
  providerId: string,
  subject: string,
  email: string,
) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !subject) throw new Error(noAccount);
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const providerResult = await client.query<{
      enabled: boolean;
      jit_provisioning: boolean;
      default_role: "client_admin" | "manager" | "employee";
    }>(
      `select enabled, jit_provisioning, default_role from identity_providers
       where id=$1 and organization_id=$2 for update`,
      [providerId, organizationId],
    );
    const provider = providerResult.rows[0];
    if (!provider?.enabled) throw new Error(noAccount);

    const identityResult = await client.query<{ id: string; is_active: boolean }>(
      `select u.id, u.is_active from user_identities i
       join portal_users u on u.id=i.portal_user_id
       where i.provider_id=$1 and i.subject=$2 and u.organization_id=$3
       for update of i, u`,
      [providerId, subject, organizationId],
    );
    if (identityResult.rows[0]) {
      if (!identityResult.rows[0].is_active) throw new Error(noAccount);
      await client.query("commit");
      return identityResult.rows[0].id;
    }

    const emailResult = await client.query<{ id: string }>(
      `select id from portal_users
       where organization_id=$1 and lower(email)=lower($2) and is_active
       order by id limit 1 for update`,
      [organizationId, normalizedEmail],
    );
    let userId = emailResult.rows[0]?.id;
    if (userId) {
      const linked = await client.query(
        `insert into user_identities (portal_user_id, provider_id, subject)
         values ($1,$2,$3) on conflict (provider_id, subject) do nothing`,
        [userId, providerId, subject],
      );
      if (!linked.rowCount) {
        const existing = await client.query<{ portal_user_id: string }>(
          "select portal_user_id from user_identities where provider_id=$1 and subject=$2",
          [providerId, subject],
        );
        if (existing.rows[0]?.portal_user_id !== userId) throw new Error(noAccount);
      }
      await client.query("commit");
      return userId;
    }

    if (!provider.jit_provisioning) throw new Error(noAccount);
    const worker = await client.query<{ id: string; display_name: string }>(
      `select w.id,
              coalesce(w.preferred_name, w.first_name) || ' ' || w.last_name as display_name
       from worker_contacts c join workers w on w.id=c.worker_id
       where c.organization_id=$1 and w.organization_id=$1
         and c.kind='email' and c.usage='work' and lower(c.value)=lower($2)
       order by c.is_primary desc, c.id limit 1`,
      [organizationId, normalizedEmail],
    );
    const displayName = worker.rows[0]?.display_name ?? normalizedEmail.split("@")[0];
    const created = await client.query<{ id: string }>(
      `insert into portal_users (organization_id, email, display_name, role, worker_id)
       values ($1,$2,$3,$4,$5) returning id`,
      [organizationId, normalizedEmail, displayName, provider.default_role, worker.rows[0]?.id ?? null],
    );
    userId = created.rows[0].id;
    await client.query(
      "insert into user_identities (portal_user_id, provider_id, subject) values ($1,$2,$3)",
      [userId, providerId, subject],
    );
    await client.query("commit");
    return userId;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
