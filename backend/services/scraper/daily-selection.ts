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
  /**
   * Cuántas personas hay por rol (`users.role_category`). Con esto, cada rol recibe
   * un tope de cupos del día proporcional a su comunidad: un rol del que hay muchas
   * vacantes pero pocas personas (ventas) no llena el feed, y uno con mucha gente
   * (backend) no se queda sin vacantes. Sin esto, los roles se reparten parejo.
   */
  roleDemand?: Record<string, number>;
}

/** Qué parte del reparto sigue a la comunidad; el resto se reparte parejo entre los roles. */
const DEMAND_WEIGHT = 0.5;

/**
 * Cuántos cupos del día puede ocupar cada rol: mitad según cuánta gente hay en ese rol
 * y mitad parejo entre los roles que hoy tienen vacantes. Los topes suman al menos
 * `slots`, así que nunca impiden llenar el día.
 */
export function roleCaps(
  roles: string[],
  slots: number,
  roleDemand: Record<string, number> = {},
): Map<string, number> {
  const total = roles.reduce((sum, role) => sum + (roleDemand[role] || 0), 0);
  const caps = new Map<string, number>();
  for (const role of roles) {
    const demandShare = total > 0 ? (roleDemand[role] || 0) / total : 1 / roles.length;
    const share = DEMAND_WEIGHT * demandShare + (1 - DEMAND_WEIGHT) / roles.length;
    caps.set(role, Math.max(1, Math.ceil(slots * share)));
  }
  return caps;
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
 *  5. Cada rol tiene un tope de cupos (`roleCaps`) según cuánta gente hay en él. Si
 *     tras respetar los topes sobra cupo, se llena sin ellos: nunca queda vacío.
 */
export function pickDailyVacancies<T extends VacancyCandidate>(
  candidates: T[],
  slots: number,
  options: DailySelectionOptions = {},
): T[] {
  const { perCompanyCap = 2, perComboCap = 3, rotation = 0, roleDemand } = options;
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
  const roleTaken = new Map<string, number>();
  const selected: T[] = [];

  const roles = [...new Set(candidates.map((candidate) => candidate.role_category || "sin-rol"))];
  const caps = roleCaps(roles, slots, roleDemand);

  // Una ronda: una vacante por empresa que aún pueda aportar.
  const round = (cap: number, respectRoleCaps: boolean): boolean => {
    let added = false;
    for (const name of order) {
      if (selected.length >= slots) return added;
      if ((taken.get(name) || 0) >= cap) continue;

      const queue = queues.get(name)!;
      // La primera de la empresa que todavía cabe. Las que no caben se quedan en la
      // cola (no se descartan): una ronda posterior, sin topes de rol, puede usarlas.
      const index = queue.findIndex((candidate) => {
        const known = candidate.role_category && candidate.seniority_level;
        const combo = `${candidate.role_category}:${candidate.seniority_level}`;
        if (known && (combos.get(combo) || 0) >= perComboCap) return false;
        const role = candidate.role_category || "sin-rol";
        return !(respectRoleCaps && (roleTaken.get(role) || 0) >= (caps.get(role) ?? slots));
      });
      if (index >= 0) {
        const candidate = queue.splice(index, 1)[0];
        const known = candidate.role_category && candidate.seniority_level;
        const combo = `${candidate.role_category}:${candidate.seniority_level}`;
        const role = candidate.role_category || "sin-rol";
        if (known) combos.set(combo, (combos.get(combo) || 0) + 1);
        roleTaken.set(role, (roleTaken.get(role) || 0) + 1);
        taken.set(name, (taken.get(name) || 0) + 1);
        selected.push(candidate);
        added = true;
      }
    }
    return added;
  };

  // Primero con el tope por empresa y el tope por rol.
  for (let cap = 1; cap <= perCompanyCap && selected.length < slots; cap++) round(cap, true);

  // Si sobró cupo, rondas extra con el tope de rol y sin el de empresa...
  let progressed = true;
  while (selected.length < slots && progressed) {
    progressed = round(Number.POSITIVE_INFINITY, true);
  }

  // ...y, si aun así sobra, sin topes de rol: es mejor llenar el día que dejarlo vacío.
  progressed = true;
  while (selected.length < slots && progressed) {
    progressed = round(Number.POSITIVE_INFINITY, false);
  }

  return selected;
}
