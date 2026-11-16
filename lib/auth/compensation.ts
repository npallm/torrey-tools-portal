const COMPENSATION_FIELDS = new Set([
  "salary",
  "annualSalary",
  "midpoint",
  "payRangeMid",
  "payRangeMin",
  "payRangeMax",
]);

export function stripCompensationDetails<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripCompensationDetails(item)) as T;
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      COMPENSATION_FIELDS.has(key) ? [] : [[key, stripCompensationDetails(child)]],
    ),
  ) as T;
}
