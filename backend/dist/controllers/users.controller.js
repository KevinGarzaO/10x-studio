"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMe = exports.getMe = void 0;
const supabase_service_1 = require("../services/supabase.service");
const getMe = async (req, res) => {
    try {
        const { data, error } = await supabase_service_1.supabase.from('users').select('*').single();
        if (error)
            return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json(data);
    }
    catch {
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.getMe = getMe;
const updateMe = async (req, res) => {
    try {
        const { data: user } = await supabase_service_1.supabase.from('users').select('id').single();
        if (!user)
            return res.status(404).json({ error: 'Usuario no encontrado' });
        const { data, error } = await supabase_service_1.supabase
            .from('users')
            .update(req.body)
            .eq('id', user.id)
            .select()
            .single();
        if (error)
            throw error;
        res.json(data);
    }
    catch {
        res.status(500).json({ error: 'Error al actualizar usuario' });
    }
};
exports.updateMe = updateMe;
