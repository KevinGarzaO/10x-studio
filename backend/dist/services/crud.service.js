"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrudService = void 0;
const supabase_service_1 = require("./supabase.service");
class CrudService {
    static async getCollection(table) {
        const { data, error } = await supabase_service_1.supabase.from(table).select('data');
        if (error)
            throw error;
        return data.map((item) => item.data);
    }
    static async saveCollection(table, dataArray) {
        // Basic implementation matching the original logic: delete all and insert
        await supabase_service_1.supabase.from(table).delete().neq('id', '0');
        if (dataArray && dataArray.length > 0) {
            const rows = dataArray.map((item) => ({
                id: item.id,
                data: item
            }));
            await supabase_service_1.supabase.from(table).insert(rows);
        }
    }
    static async createItem(table, item) {
        await supabase_service_1.supabase.from(table).upsert({ id: item.id || item.topic, data: item });
    }
    static async updateItem(table, item) {
        await supabase_service_1.supabase.from(table).update({ data: item }).eq('id', item.id || item.topic);
    }
    static async deleteItem(table, id) {
        await supabase_service_1.supabase.from(table).delete().eq('id', id);
    }
    static async getSingular(table, fallback) {
        const { data, error } = await supabase_service_1.supabase.from(table).select('data').eq('id', 1).single();
        if (error || !data)
            return fallback;
        return data.data;
    }
    static async saveSingular(table, data) {
        await supabase_service_1.supabase.from(table).upsert({ id: 1, data, updated_at: new Date().toISOString() });
    }
}
exports.CrudService = CrudService;
