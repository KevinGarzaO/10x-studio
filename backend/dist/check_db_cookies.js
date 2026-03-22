"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_service_1 = require("./services/supabase.service");
async function checkCookies() {
    const { data, error } = await supabase_service_1.supabase.from('cookies').select('*').limit(1);
    if (error) {
        console.error('Error fetching cookies:', error);
    }
    else {
        console.log('Cookies in DB:', data);
    }
    process.exit(0);
}
checkCookies();
