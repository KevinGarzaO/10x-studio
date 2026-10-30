/**
 * Lee todas las filas de una consulta, de mil en mil: la base entrega a lo más mil por consulta, y
 * una cuenta sobre una página incompleta saldría baja sin avisar.
 */
export async function readAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  max = 20000,
): Promise<T[]> {
  const rows: T[] = []
  // Las páginas se piden de a PARALLEL a la vez, no una tras otra: con miles de filas era lo que más tardaba.
  const PARALLEL = 4
  for (let from = 0; from < max; from += 1000 * PARALLEL) {
    const batch = await Promise.all(
      Array.from({ length: PARALLEL }, (_, i) => from + i * 1000).filter(start => start < max).map(start => build(start, start + 999)),
    )
    let last = false
    for (const { data, error } of batch) {
      if (error) throw new Error(error.message)
      rows.push(...(data ?? []))
      if (!data || data.length < 1000) { last = true; break }
    }
    if (last) break
  }
  return rows
}
