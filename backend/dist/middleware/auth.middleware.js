"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const authMiddleware = (req, res, next) => {
    // Placeholder para autenticación
    // En un entorno real, aquí se verificaría un JWT o una sesión
    // Por ahora dejamos pasar todas las peticiones
    next();
};
exports.authMiddleware = authMiddleware;
