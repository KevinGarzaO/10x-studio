/**
 * ¿Son estos dos listados de skills el mismo, en el mismo orden?
 *
 * Sirve para no reescribir `users.skills` cuando no cambió: la base valida cada
 * skill contra el catálogo en cualquier UPDATE que incluya la columna, así que
 * un guardado de foto o bio no debe tocarla.
 */
export function sameSkills(next: string[], stored: unknown): boolean {
  if (!Array.isArray(stored) || next.length !== stored.length) return false
  return next.every((skill, index) => skill === stored[index])
}
