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
        const draftId = "191713627"; // Provided by previous script execution
        console.log("Operating on existing draft:", draftId);
        // 1. Put NEW literal string mimicking TipTap extensive edits
        const testBody = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"attrs\":{\"textAlign\":null},\"content\":[{\"type\":\"text\",\"text\":\"API DIAGNOSTIC TEST\"}]},{\"type\":\"paragraph\",\"attrs\":{\"textAlign\":null},\"content\":[{\"type\":\"text\",\"text\":\"NEW AUTOSAVE CONTENT LOADED SAFELY!\"}]},{\"type\":\"heading\",\"attrs\":{\"textAlign\":null,\"level\":2},\"content\":[{\"type\":\"text\",\"text\":\"This is a test header to ensure complex formatting survives.\"}]}]}";
        console.log("Attempting Update PUT...");
        const res = await substack_service_1.SubstackService.updateDraft(user.id, String(draftId), {
            draft_title: "Diag Test Update",
            draft_subtitle: "Checking sequential edit safety",
            draft_body: testBody,
            section_chosen: false,
            draft_podcast_url: null,
            draft_podcast_duration: null,
            draft_section_id: null,
            audience: 'everyone',
            type: 'newsletter'
        });
        console.log("PUT Result Body sample:", res.draft_body ? res.draft_body.slice(0, 50) + "..." : "no body");
        // 2. Schedule for 10 days in the future
        const triggerAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
        console.log("Attempting Schedule POST for", triggerAt);
        const schedRes = await substack_service_1.SubstackService.scheduleDraft(user.id, draftId, triggerAt);
        console.log("Schedule Result:", schedRes);
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
