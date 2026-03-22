"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_service_1 = require("./services/supabase.service");
async function checkUserHandle() {
    const { data, error } = await supabase_service_1.supabase.from('users').select('id, handle, subdomain').limit(5);
    if (error) {
        console.error('Error fetching users:', error);
    }
    else {
        console.log('Users in DB:', data);
    }
    process.exit(0);
}
checkUserHandle();
