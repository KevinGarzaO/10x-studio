import { supabase } from '../supabase.service'
import type { ValidationLevel } from './score'

/**
 * Los skills que la persona validó con examen y el mejor nivel que sacó en cada uno
 * (user_skill_levels). Con el nombre del skill en minúsculas, como lo usa el match.
 *
 * Si la tabla no está (migración de exámenes sin aplicar) o falla la lectura, devuelve
 * vacío: el match sigue funcionando, solo sin el bonus.
 */
export async function loadValidatedSkills(userId: string | undefined): Promise<Record<string, ValidationLevel>> {
  if (!userId) return {}
  const { data, error } = await supabase.from('user_skill_levels').select('skill_name, level').eq('user_id', userId)
  if (error || !data) return {}

  const levels: Record<string, ValidationLevel> = {}
  for (const row of data as { skill_name: string; level: string }[]) {
    if (row.level === 'basico' || row.level === 'intermedio' || row.level === 'avanzado') {
      levels[row.skill_name.toLowerCase()] = row.level
    }
  }
  return levels
}
