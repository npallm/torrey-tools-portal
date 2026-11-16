import { NextResponse } from "next/server";
import { finchConfigured, getFinchDirectory } from "@/lib/finch";
import { employees } from "@/lib/data";
import { requireUser } from "@/lib/auth/session";

export async function GET() {
  await requireUser("/api/finch/directory");
  if (!finchConfigured()) {
    // Fall back to seed data so the portal works before Finch is connected.
    return NextResponse.json({
      source: "seed",
      directory: employees.map((e) => ({
        id: e.id,
        firstName: e.name.split(" ")[0],
        lastName: e.name.split(" ").slice(1).join(" "),
        department: e.department,
        title: e.title,
        isActive: e.status !== "Offboarding",
      })),
    });
  }
  try {
    const directory = await getFinchDirectory();
    return NextResponse.json({ source: "finch", directory });
  } catch (err) {
    return NextResponse.json(
      { source: "finch", error: String(err), directory: [] },
      { status: 502 }
    );
  }
}
