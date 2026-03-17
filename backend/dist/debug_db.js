"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../backend/.env') });
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
async function checkData() {
    console.log('--- USERS ---');
    const { data: users, error: uErr } = await supabase.from('users').select('*');
    if (uErr)
        console.error(uErr);
    else
        console.table(users.map(u => ({ id: u.id, name: u.name, substack_user_id: u.substack_user_id, substack_slug: u.substack_slug })));
    console.log('--- PUBLICATIONS ---');
    const { data: pubs, error: pErr } = await supabase.from('publications').select('*');
    if (pErr)
        console.error(pErr);
    else
        console.table(pubs.map(p => ({ id: p.id, name: p.name, subdomain: p.subdomain, publication_id: p.publication_id })));
}
checkData();
