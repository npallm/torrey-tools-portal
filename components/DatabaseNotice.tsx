import { DATABASE_REQUIRED_MESSAGE } from "@/lib/server/common";

export function DatabaseNotice() {
  return <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{DATABASE_REQUIRED_MESSAGE}</p>;
}
