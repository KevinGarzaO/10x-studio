/**
 * Lee todas las filas de una consulta, de mil en mil: la base entrega a lo más mil por consulta, y
 * una cuenta sobre una página incompleta saldría baja sin avisar.
 */
export async function readAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  max = 20000,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return rows
}
