import { Badge } from "@/components/Badge";
import { PageHeader } from "@/components/PageHeader";
import { employeeName, onboardingTasks } from "@/lib/data";

export default function OnboardingPage() {
  const byEmployee = new Map<string, typeof onboardingTasks>();
  for (const t of onboardingTasks) {
    const list = byEmployee.get(t.employeeId) ?? [];
    list.push(t);
    byEmployee.set(t.employeeId, list);
  }

  return (
    <div>
      <PageHeader
        title="Onboarding"
        subtitle="New-hire checklists and their progress."
      />
      <div className="space-y-6">
        {[...byEmployee.entries()].map(([empId, tasks]) => {
          const done = tasks.filter((t) => t.done).length;
          return (
            <section
              key={empId}
              className="rounded-lg border border-slate-200 bg-white p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">{employeeName(empId)}</h2>
                <Badge tone={done === tasks.length ? "green" : "yellow"}>
                  {done}/{tasks.length} complete
                </Badge>
              </div>
              <ul className="divide-y divide-slate-100">
                {tasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span
                      className={t.done ? "text-slate-400 line-through" : ""}
                    >
                      {t.label}
                    </span>
                    <span className="text-xs text-slate-500">
                      due {t.dueDate}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
