"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_service_1 = require("./services/supabase.service");
const substack_service_1 = require("./services/substack.service");
const node_fetch_1 = __importDefault(require("node-fetch"));
async function run() {
    const { data: user } = await supabase_service_1.supabase.from('users').select('id, subdomain').limit(1).single();
    if (!user)
        return console.log("NO USER");
    const cookie = await substack_service_1.SubstackService.getCookieHeader(user.id);
    const subdomain = user.subdomain || 'transformateck';
    const origin = `https://${subdomain}.substack.com`;
    const headers = {
        ...substack_service_1.SubstackService.getHeaders(cookie, origin),
        'Referer': `${origin}/publish/posts/drafts`,
        'Accept': '*/*',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
    };
    console.log("--- Test GET /api/v1/post_management/drafts ---");
    const r1 = await (0, node_fetch_1.default)(`${origin}/api/v1/post_management/drafts?offset=0&limit=5&order_by=draft_updated_at&order_direction=desc`, {
        method: 'GET',
        headers
    });
    const t1 = await r1.text();
    console.log("Status:", r1.status);
    console.log("Body preview:", t1.slice(0, 200));
}
run();
