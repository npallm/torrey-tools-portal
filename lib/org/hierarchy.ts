/** Supervisory-organization helpers (Workday-style: a sup org is everyone under a manager, directly or indirectly). */

export type OrgPerson = { id: string; name: string; managerId: string | null };

/** Management chain from direct manager up to the top. Cycles are cut. */
export function managerChain(personId: string, people: OrgPerson[]): string[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const chain: string[] = [];
  const seen = new Set<string>([personId]);
  let current = byId.get(personId)?.managerId ?? null;
  while (current && !seen.has(current)) {
    chain.push(current);
    seen.add(current);
    current = byId.get(current)?.managerId ?? null;
  }
  return chain;
}

/** Members of `leaderId`'s supervisory org (all direct and indirect reports, excluding the leader). */
export function supOrgMembers(leaderId: string, people: OrgPerson[]): string[] {
  return people.filter((p) => managerChain(p.id, people).includes(leaderId)).map((p) => p.id);
}

/** Leaders that have at least one report, with org size; label "<Name>'s org". */
export function supOrgs(people: OrgPerson[]): { leaderId: string; label: string; size: number }[] {
  return people
    .map((p) => ({ leaderId: p.id, label: `${p.name}'s org`, size: supOrgMembers(p.id, people).length }))
    .filter((o) => o.size > 0)
    .sort((a, b) => b.size - a.size || a.label.localeCompare(b.label));
}
