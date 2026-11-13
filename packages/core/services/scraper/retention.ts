import { supabase } from "../supabase.service";

const SAFETY_CAP_PER_COMBO = 150;

/**
 * Runs once per 15-day cycle, immediately before Production starts a new
 * one — clears out whatever never got promoted during the closing cycle, so
 * scraper_posts starts every cycle at (close to) zero instead of growing
 * without bound. community_posts already holds its own permanent copy of
 * anything that WAS promoted, so this is safe.
 */
export async function sweepUnsyncedLeftovers(
  log: (msg: string) => void = () => {}
): Promise<number> {
  const { count, error } = await supabase
    .from("scraper_posts")
    .delete({ count: "exact" })
    .eq("synced_to_community", false);

  if (error) {
    log(`[Sweep] Error limpiando scraper_posts: ${error.message}`);
    throw error;
  }

  log(`[Sweep] ${count ?? 0} scraper_posts sin sincronizar eliminados (cierre de ciclo)`);
  return count ?? 0;
}

/**
 * Safety valve, not a normal-use limit — the 25-30/source cap already
 * applied in producer.ts keeps ordinary volume well under this. Trims any
 * (role_category, seniority_level) combo that somehow exceeds
 * SAFETY_CAP_PER_COMBO, keeping the most recently-posted rows (by
 * post_date) and deleting the rest. Supabase's REST layer has no
 * ROW_NUMBER()/PARTITION BY, so this is done by paginating the table once
 * and grouping client-side — fine at this volume (tens of thousands of rows
 * at most, run once per 15-day cycle).
 */
export async function enforceSafetyCap(
  log: (msg: string) => void = () => {}
): Promise<number> {
  const rows: { id: string; role_category: string | null; seniority_level: string | null; post_date: string | null }[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("scraper_posts")
      .select("id, role_category, seniority_level, post_date")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const byCombo = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.role_category ?? "sin-categoria"}:${r.seniority_level ?? "sin-nivel"}`;
    if (!byCombo.has(key)) byCombo.set(key, []);
    byCombo.get(key)!.push(r);
  }

  const idsToDelete: string[] = [];
  for (const [key, combo] of byCombo) {
    if (combo.length <= SAFETY_CAP_PER_COMBO) continue;
    const sorted = [...combo].sort(
      (a, b) => new Date(b.post_date ?? 0).getTime() - new Date(a.post_date ?? 0).getTime()
    );
    const overflow = sorted.slice(SAFETY_CAP_PER_COMBO);
    idsToDelete.push(...overflow.map((r) => r.id));
    log(`[SafetyCap] ${key}: ${combo.length} filas, recortando ${overflow.length}`);
  }

  if (idsToDelete.length === 0) {
    log("[SafetyCap] Ninguna combinación excede el tope de seguridad");
    return 0;
  }

  // Delete in chunks to stay well under any request-size limits.
  const chunkSize = 200;
  for (let i = 0; i < idsToDelete.length; i += chunkSize) {
    const chunk = idsToDelete.slice(i, i + chunkSize);
    const { error } = await supabase.from("scraper_posts").delete().in("id", chunk);
    if (error) throw error;
  }

  log(`[SafetyCap] ${idsToDelete.length} filas eliminadas por exceder el tope de ${SAFETY_CAP_PER_COMBO}/combinación`);
  return idsToDelete.length;
}
