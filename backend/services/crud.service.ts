import { supabase } from './supabase.service'

export class CrudService {
  static async getCollection(table: string) {
    const { data, error } = await supabase.from(table).select('data')
    if (error) throw error
    return data.map((item: any) => item.data)
  }

  static async saveCollection(table: string, dataArray: any[]) {
    // Basic implementation matching the original logic: delete all and insert
    await supabase.from(table).delete().neq('id', '0')
    if (dataArray && dataArray.length > 0) {
      const rows = dataArray.map((item: any) => ({
        id: item.id,
        data: item
      }))
      await supabase.from(table).insert(rows)
    }
  }

  static async createItem(table: string, item: any) {
    await supabase.from(table).upsert({ id: item.id || item.topic, data: item })
  }

  static async updateItem(table: string, item: any) {
    await supabase.from(table).update({ data: item }).eq('id', item.id || item.topic)
  }

  static async deleteItem(table: string, id: string) {
    await supabase.from(table).delete().eq('id', id)
  }

  static async getSingular(table: string, fallback: any) {
    const { data, error } = await supabase.from(table).select('data').eq('id', 1).single()
    if (error || !data) return fallback
    return data.data
  }

  static async saveSingular(table: string, data: any) {
    await supabase.from(table).upsert({ id: 1, data, updated_at: new Date().toISOString() })
  }
}
