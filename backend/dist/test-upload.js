"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const substack_service_1 = require("./services/substack.service");
const supabase_service_1 = require("./services/supabase.service");
async function run() {
    try {
        const { data: user } = await supabase_service_1.supabase.from('users').select('id, substack_user_id').limit(1).single();
        if (!user)
            return console.log("NO USER");
        console.log("Found user:", user.id);
        // Tiny 1x1 transparent PNG payload
        const tinyBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        const postId = "191713627"; // Provided by previous script
        console.log("Attempting Upload POST directly...");
        const res = await substack_service_1.SubstackService.uploadImage(user.id, tinyBase64, postId);
        console.log("UPLOAD RAW RESULT:", res);
    }
    catch (e) {
        if (e.response) {
            console.error("FAILED HTTP:", e.response.status, await e.response.text());
        }
        else {
            console.error("FAILED:", e.message || e);
        }
    }
}
run();
