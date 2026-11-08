import { PageHeader } from "@/components/PageHeader";
import { RequestCenter } from "@/components/RequestCenter";
import { changeRequests, employees } from "@/lib/data";

export default function RequestsPage() {
  const employeeOptions = employees.map((e) => ({ id: e.id, name: e.name }));
  const seeded = changeRequests.map((r) => ({
    ...r,
    employeeName: employees.find((e) => e.id === r.employeeId)?.name ?? r.employeeId,
  }));

  return (
    <div>
      <PageHeader
        title="Employee Change Requests"
        subtitle="Submit requests for title, comp, schedule, or status changes — HR reviews them here."
      />
      <RequestCenter employees={employeeOptions} seeded={seeded} />
    </div>
  );
}
