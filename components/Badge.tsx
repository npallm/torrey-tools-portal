const tones: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-800",
  yellow: "bg-amber-100 text-amber-800",
  red: "bg-rose-100 text-rose-800",
  slate: "bg-slate-100 text-slate-700",
  blue: "bg-sky-100 text-sky-800",
};

export function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): keyof typeof tones {
  switch (status) {
    case "Active":
    case "Approved":
    case "Complete":
      return "green";
    case "Pending":
    case "In progress":
    case "On leave":
      return "yellow";
    case "Denied":
      return "red";
    default:
      return "slate";
  }
}
