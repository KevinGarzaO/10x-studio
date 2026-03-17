"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCron = exports.syncSubstackData = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const supabase_service_1 = require("./supabase.service");
const substack_service_1 = require("./substack.service");
const syncSubstackData = async (userIdStr) => {
    try {
        let query = supabase_service_1.supabase.from('users').select('id, substack_user_id, substack_slug, subdomain');
        if (userIdStr)
            query = query.eq('id', userIdStr);
        const { data: users, error } = await query;
        if (error)
            throw error;
        for (const user of users) {
            if (!user.substack_slug)
                continue; // Skip if not fully setup
            try {
                console.log(`[Cron] Sincronizando usuario: ${user.substack_slug}`);
                // Extraer solo el handle del slug (280221962-kevin-garza → kevin-garza)
                const handle = user.substack_slug?.split('-').slice(1).join('-') || user.substack_slug;
                await substack_service_1.SubstackService.syncProfile(user.id, user.substack_user_id, handle);
                // Si no tenemos subdomain en users, lo sacamos de publications
                let subdomain = user.subdomain;
                if (!subdomain) {
                    const { data: pubs } = await supabase_service_1.supabase.from('publications').select('subdomain').eq('user_id', user.id);
                    subdomain = pubs?.[0]?.subdomain;
                }
                if (subdomain) {
                    // 2. Sincronizar posts
                    await substack_service_1.SubstackService.syncPosts(user.id, subdomain);
                    // 3. Sincronizar estadísticas
                    await substack_service_1.SubstackService.syncStats(user.id, subdomain);
                    // 4. Sincronizar lista de suscriptores completa
                    await substack_service_1.SubstackService.syncSubscribers(user.id, subdomain);
                }
                console.log(`[Cron] Sincronización completada para: ${user.substack_slug}`);
            }
            catch (innerError) {
                console.error(`[Cron] Error sincronizando usuario ${user.substack_slug}:`, innerError);
            }
        }
    }
    catch (error) {
        console.error('Error general en syncSubstackData:', error);
    }
};
exports.syncSubstackData = syncSubstackData;
const initCron = () => {
    // Cada 15 minutos
    node_cron_1.default.schedule('*/15 * * * *', async () => {
        console.log('Iniciando sincronización programada:', new Date().toISOString());
        await (0, exports.syncSubstackData)();
    });
    console.log('Cron service initialized (Every 15 minutes)');
};
exports.initCron = initCron;
