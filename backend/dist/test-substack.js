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
        // 1. Create dummy draft
        const draft = await substack_service_1.SubstackService.createDraft(user.id, {
            draft_title: "TESTING API SCHEMA",
            draft_subtitle: "Substack Error Debugging Payload"
        });
        console.log("Draft created:", draft.id);
        // 2. Put literal string matching Substack HAR exactly
        const testBody = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"attrs\":{\"textAlign\":null},\"content\":[{\"type\":\"text\",\"text\":\"API DIAGNOSTIC TEST\"}]}]}";
        console.log("Attempting PUT...");
        const res = await substack_service_1.SubstackService.updateDraft(user.id, String(draft.id), {
            draft_title: "Upd Title",
            draft_subtitle: "Upd Sub",
            draft_body: testBody,
            section_chosen: false,
            draft_podcast_url: null,
            draft_podcast_duration: null,
            draft_section_id: null,
            audience: 'everyone',
            type: 'newsletter'
        });
        console.log("PUT Result:", res.draft_body.slice(0, 100));
    }
    catch (e) {
        if (e.response) {
            console.error("FAILED HTTP:", e.response.status, await e.response.text());
        }
        else {
            console.error("FAILED:", e);
        }
    }
}
run();
