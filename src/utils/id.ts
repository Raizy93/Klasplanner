let counter = 0;

/** Genereert een stabiel, uniek ID met een leesbaar voorvoegsel (bijv. `stu_k3x9…`). */
export function createId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rand}${counter.toString(36)}`;
}
