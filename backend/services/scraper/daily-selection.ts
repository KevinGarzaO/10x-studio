import { companySlug } from "../company";

/** Lo mínimo que se necesita saber de una vacante en espera para elegirla. */
export interface VacancyCandidate {
  id: string;
  company: string | null;
  source?: string | null;
  role_category: string | null;
  seniority_level: string | null;
}

export interface DailySelectionOptions {
  /** Máximo por empresa mientras haya otras empresas con qué llenar el día. */
  perCompanyCap?: number;
  /** Máximo por (rol, nivel) cuando ambos se conocen. */
  perComboCap?: number;
  /**
   * Qué empresa va primero. Cambia cada día, para que a lo largo de la semana
   * todas tengan su turno de abrir el reparto.
   */
  rotation?: number;
}

/**
 * Elige las vacantes que se publican hoy: muchas empresas distintas, no 20 de la
 * misma.
 *
 * Antes se tomaban las más antiguas del área de paso y la diversidad se medía
 * por rol y nivel, nunca por empresa; las empresas que se scrapearon primero
 * (Stripe, Asana, GitLab) llenaban el día entero. Ahora:
 *
 *  1. Se agrupan los candidatos por empresa, conservando el orden en que llegan
 *     (el llamador los manda del más reciente al más viejo).
 *  2. Se reparte por rondas: una vacante por empresa en cada ronda, empezando por
 *     una empresa distinta cada día.
 *  3. Cada empresa aporta como máximo `perCompanyCap`, salvo que falten
 *     vacantes para llenar el día: entonces siguen rondas extra, siempre
 *     repartiendo parejo, para no desperdiciar cupo.
 *  4. Un rol y nivel conocidos no pasan de `perComboCap` por día, para no llenar
 *     el día con un solo tipo de puesto. Lo que no está clasificado no se limita.
 */
export function pickDailyVacancies<T extends VacancyCandidate>(
  candidates: T[],
  slots: number,
  options: DailySelectionOptions = {},
): T[] {
  const { perCompanyCap = 2, perComboCap = 3, rotation = 0 } = options;
  if (slots <= 0 || candidates.length === 0) return [];

  const queues = new Map<string, T[]>();
  for (const candidate of candidates) {
    const key = companySlug(candidate.company || candidate.source || "") || "sin-empresa";
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key)!.push(candidate);
  }

  // Orden estable por nombre y luego girado según el día.
  const names = [...queues.keys()].sort();
  const start = ((rotation % names.length) + names.length) % names.length;
  const order = [...names.slice(start), ...names.slice(0, start)];

  const combos = new Map<string, number>();
  const taken = new Map<string, number>();
  const selected: T[] = [];

  // Una ronda: una vacante por empresa que aún pueda aportar.
  const round = (cap: number): boolean => {
    let added = false;
    for (const name of order) {
      if (selected.length >= slots) return added;
      if ((taken.get(name) || 0) >= cap) continue;

      const queue = queues.get(name)!;
      while (queue.length > 0) {
        const candidate = queue.shift()!;
        const known = candidate.role_category && candidate.seniority_level;
        const combo = `${candidate.role_category}:${candidate.seniority_level}`;
        if (known && (combos.get(combo) || 0) >= perComboCap) continue;

        if (known) combos.set(combo, (combos.get(combo) || 0) + 1);
        taken.set(name, (taken.get(name) || 0) + 1);
        selected.push(candidate);
        added = true;
        break;
      }
    }
    return added;
  };

  // Primero con el tope por empresa.
  for (let cap = 1; cap <= perCompanyCap && selected.length < slots; cap++) round(cap);

  // Si sobró cupo, rondas extra sin ese tope (y sin pasar a quien ya no tiene).
  let progressed = true;
  while (selected.length < slots && progressed) {
    progressed = round(Number.POSITIVE_INFINITY);
  }

  return selected;
}
