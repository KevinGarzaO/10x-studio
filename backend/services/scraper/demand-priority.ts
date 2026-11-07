import { supabase } from "../supabase.service";
import { classifyRole } from "./role-rules";

/**
 * Cambio A de «oferta de vacantes» (decisión del fundador, 6 nov 2026): cuando una fuente trae más vacantes que el tope por corrida
 * (MAX_POSTS_PER_SOURCE), el recorte ya no es solo «las más recientes»: primero se quedan las de puestos para los que HAY candidatas y
 * candidatos en la comunidad, y dentro de cada grupo las más recientes. Así el cupo del scraper (y el de Railway) se gasta en lo que le va a
 * servir a alguien. No descarta nada que quepa: si la fuente trae menos del tope, entra todo como antes.
 *
 * Solo mira el PUESTO (se clasifica por el título, igual que al guardar). Las habilidades se conocen después, al enriquecer, y ahí la regla
 * «sirve a alguien» (services/vacancies/serves-someone.ts) sigue decidiendo qué sale al feed.
 */

/** Cuántas personas reales hay por puesto (`users.role_category`). Sin lectura: undefined y el orden es solo por fecha, como antes. */
export async function loadRoleDemand(): Promise<Record<string, number> | undefined> {
  const { data, error } = await supabase
    .from("users")
    .select("role_category")
    .eq("account_type", "candidate")
    .eq("is_test_account", false)
    .eq("is_scraper_profile", false)
    .not("role_category", "is", null)
    .limit(20000);
  if (error || !data) return undefined;
  const demand: Record<string, number> = {};
  for (const row of data as { role_category: string }[]) demand[row.role_category] = (demand[row.role_category] || 0) + 1;
  return demand;
}

interface Prioritizable { text: string; postDate?: string | null }

const time = (post: Prioritizable) => new Date(post.postDate ?? 0).getTime();

/**
 * Las `cap` vacantes que se procesan: primero las de puestos con candidatas (solo «hay» o «no hay», sin ordenar por cuánta gente, para no
 * volver a llenar todo de backend), luego el resto; en cada grupo, las más recientes primero. Pura y estable.
 */
export function prioritizeByDemand<T extends Prioritizable>(posts: T[], demand: Record<string, number> | undefined, cap: number): T[] {
  const served = (post: T): boolean => {
    if (!demand || Object.keys(demand).length === 0) return false;
    const role = classifyRole(post.text);
    return !!role && (demand[role] ?? 0) > 0;
  };
  return posts
    .map((post, index) => ({ post, index, served: served(post) }))
    .sort((a, b) => Number(b.served) - Number(a.served) || time(b.post) - time(a.post) || a.index - b.index)
    .slice(0, cap)
    .map((entry) => entry.post);
}
