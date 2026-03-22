"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const substack_service_1 = require("./services/substack.service");
const supabase_service_1 = require("./services/supabase.service");
async function run() {
    try {
        const { data: user } = await supabase_service_1.supabase.from('users').select('id').limit(1).single();
        if (!user)
            return console.log("NO USER");
        console.log("Found user:", user.id);
        const testNote = "Prueba de Note desde 10x-Studio API 🚀 — " + new Date().toLocaleTimeString('es-MX');
        console.log("Publicando Note:", testNote);
        const result = await substack_service_1.SubstackService.publishNote(user.id, testNote);
        console.log("RESULT OK:", JSON.stringify(result, null, 2));
    }
    catch (e) {
        console.error("ERROR:", e.message || e);
    }
}
run();
