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
async function check() {
    const { data: u } = await supabase.from('users').select('*').limit(1);
    console.log('User keys:', u ? Object.keys(u[0]) : 'None');
    const { data: p } = await supabase.from('publications').select('*').limit(1);
    console.log('Pub keys:', p ? Object.keys(p[0]) : 'None');
}
check();
