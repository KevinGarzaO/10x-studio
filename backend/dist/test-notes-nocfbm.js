"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_service_1 = require("./services/supabase.service");
const node_fetch_1 = __importDefault(require("node-fetch"));
async function run() {
    const { data: user } = await supabase_service_1.supabase.from('users').select('id, subdomain').limit(1).single();
    if (!user)
        return console.log("NO USER");
    // Build cookie WITHOUT __cf_bm (which expires every 30 min)
    const { data: cookies } = await supabase_service_1.supabase
        .from('cookies')
        .select('substack_sid, substack_lli, visit_id, cf_clearance, ab_testing_id, cookie_storage_key')
        .eq('user_id', user.id)
        .single();
    if (!cookies)
        return console.log("NO COOKIES");
    const parts = [];
    if (cookies.substack_sid)
        parts.push(`substack.sid=${cookies.substack_sid}`);
    if (cookies.substack_lli)
        parts.push(`substack.lli=${cookies.substack_lli}`);
    if (cookies.visit_id)
        parts.push(`visit_id=${cookies.visit_id}`);
    if (cookies.cf_clearance)
        parts.push(`cf_clearance=${cookies.cf_clearance}`);
    if (cookies.ab_testing_id)
        parts.push(`ab_testing_id=${cookies.ab_testing_id}`);
    if (cookies.cookie_storage_key)
        parts.push(`cookie_storage_key=${cookies.cookie_storage_key}`);
    // __cf_bm intentionally EXCLUDED
    const cookie = parts.join('; ');
    const subdomain = user.subdomain || 'transformateck';
    const origin = `https://${subdomain}.substack.com`;
    const headers = {
        'Cookie': cookie,
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'Accept-Language': 'es-ES,es;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        'Origin': origin,
        'Referer': `${origin}/publish/posts/drafts`,
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'sec-gpc': '1',
    };
    const bodyJson = {
        type: "doc",
        attrs: { schemaVersion: "v1" },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Test sin __cf_bm - " + new Date().toLocaleTimeString() }] }]
    };
    console.log("Intentando POST sin __cf_bm...");
    const res = await (0, node_fetch_1.default)(`${origin}/api/v1/comment/feed`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ bodyJson, replyMinimumRole: "everyone" })
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Body:", text.slice(0, 500));
}
run();
