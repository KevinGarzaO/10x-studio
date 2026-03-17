"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const CrudController = __importStar(require("../controllers/crud.controller"));
const router = (0, express_1.Router)();
// Topics
router.get('/topics', CrudController.getCollection('topics'));
router.post('/topics', CrudController.saveCollection('topics'));
router.put('/topics', CrudController.saveCollection('topics'));
router.delete('/topics', CrudController.saveCollection('topics')); // Original logic re-saves whole collection
// History
router.get('/history', CrudController.getCollection('history'));
router.post('/history', CrudController.saveCollection('history'));
router.delete('/history', CrudController.saveCollection('history'));
// Calendar
router.get('/calendar', CrudController.getCollection('calendar'));
router.post('/calendar', CrudController.saveCollection('calendar'));
router.put('/calendar', CrudController.saveCollection('calendar'));
router.delete('/calendar', CrudController.saveCollection('calendar'));
// Settings
router.get('/settings', CrudController.getSingular('settings', {}));
router.post('/settings', CrudController.saveSingular('settings'));
// Templates
router.get('/templates', CrudController.getCollection('templates'));
router.post('/templates', CrudController.saveCollection('templates'));
router.put('/templates', CrudController.saveCollection('templates'));
router.delete('/templates', CrudController.saveCollection('templates'));
// Campaigns
router.get('/campaigns', CrudController.getCollection('campaigns'));
router.post('/campaigns', CrudController.saveCollection('campaigns'));
router.put('/campaigns', CrudController.saveCollection('campaigns'));
router.delete('/campaigns', CrudController.saveCollection('campaigns'));
exports.default = router;
