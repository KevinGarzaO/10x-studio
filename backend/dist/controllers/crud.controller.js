"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveSingular = exports.getSingular = exports.saveCollection = exports.getCollection = void 0;
const crud_service_1 = require("../services/crud.service");
const getCollection = (table) => async (req, res) => {
    try {
        const data = await crud_service_1.CrudService.getCollection(table);
        res.json(data);
    }
    catch {
        res.status(500).json({ error: `Error fetching ${table}` });
    }
};
exports.getCollection = getCollection;
const saveCollection = (table) => async (req, res) => {
    try {
        await crud_service_1.CrudService.saveCollection(table, req.body);
        res.json({ ok: true });
    }
    catch {
        res.status(500).json({ error: `Error saving ${table}` });
    }
};
exports.saveCollection = saveCollection;
const getSingular = (table, fallback) => async (req, res) => {
    try {
        const data = await crud_service_1.CrudService.getSingular(table, fallback);
        res.json(data);
    }
    catch {
        res.status(500).json({ error: `Error fetching ${table}` });
    }
};
exports.getSingular = getSingular;
const saveSingular = (table) => async (req, res) => {
    try {
        await crud_service_1.CrudService.saveSingular(table, req.body);
        res.json({ ok: true });
    }
    catch {
        res.status(500).json({ error: `Error saving ${table}` });
    }
};
exports.saveSingular = saveSingular;
