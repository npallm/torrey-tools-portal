import { createHash } from "node:crypto";

export type FeedbackPerson = {
  id: string;
  managerId: string | null;
  department: string;
  active: boolean;
  organizationId: string;
};

export function suggestFeedbackPeers(subjectId: string, people: FeedbackPerson[]) {
  const subject = people.find((person) => person.id === subjectId);
  if (!subject) return [];
  return people
    .filter((person) =>
      person.active
      && person.id !== subject.id
      && person.id !== subject.managerId
      && person.organizationId === subject.organizationId
      && (person.managerId === subject.managerId || person.department === subject.department),
    )
    .sort((a, b) => {
      const aTeam = a.managerId === subject.managerId ? 0 : 1;
      const bTeam = b.managerId === subject.managerId ? 0 : 1;
      return aTeam - bTeam || a.id.localeCompare(b.id);
    })
    .map((person) => person.id);
}

export function feedbackPeerError(
  recipients: FeedbackPerson[],
  subjectId: string,
  requesterId: string,
  organizationId: string,
) {
  const distinct = new Set(recipients.map((person) => person.id));
  if (distinct.size !== recipients.length) return "Choose each peer only once.";
  if (recipients.length < 2 || recipients.length > 10) return "Choose between 2 and 10 peers.";
  if (recipients.some((person) => person.id === subjectId || person.id === requesterId)) {
    return "The subject and requesting manager cannot be feedback recipients.";
  }
  if (recipients.some((person) => !person.active || person.organizationId !== organizationId)) {
    return "Choose active peers from this organization.";
  }
  return null;
}

export function isFeedbackDirectManager(chain: string[], requesterId: string) {
  return chain[0] === requesterId;
}

export function feedbackResultsUnlocked(responseCount: number, minimum = 3) {
  return responseCount >= minimum;
}

export function stableFeedbackOrder<T extends { id: string }>(responses: T[]) {
  return [...responses].sort((a, b) => {
    const hashA = createHash("sha256").update(a.id).digest("hex");
    const hashB = createHash("sha256").update(b.id).digest("hex");
    return hashA.localeCompare(hashB);
  });
}
