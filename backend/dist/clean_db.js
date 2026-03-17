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
async function clean() {
    console.log('Borrando datos para resetear e iniciar sincronización limpia...');
    const { error: pErr } = await supabase.from('publications').delete().neq('id', 'dummy');
    console.log('Publications borradas:', pErr || 'OK');
    const { error: uErr } = await supabase.from('users').delete().neq('id', 'dummy');
    console.log('Users borrados:', uErr || 'OK');
}
clean();
