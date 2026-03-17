"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const dotenv_1 = __importDefault(require("dotenv"));
const substack_1 = __importDefault(require("./routes/substack"));
const users_1 = __importDefault(require("./routes/users"));
const crud_1 = __importDefault(require("./routes/crud"));
const ai_1 = __importDefault(require("./routes/ai"));
const cron_service_1 = require("./services/cron.service");
const auth_middleware_1 = require("./middleware/auth.middleware");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Swagger config
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: '10X Studio API',
            version: '1.0.0',
            description: 'API de 10X Studio - Migrada de Next.js API Routes'
        },
        servers: [
            { url: '/', description: 'Servidor Actual' },
            { url: `http://localhost:${PORT}`, description: 'Localhost' }
        ]
    },
    apis: ['./routes/*.ts', './routes/*.js']
};
const swaggerDocs = (0, swagger_jsdoc_1.default)(swaggerOptions);
app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerDocs));
// Routes
app.use('/api', auth_middleware_1.authMiddleware, crud_1.default);
app.use('/api', auth_middleware_1.authMiddleware, ai_1.default);
app.use('/api/substack', auth_middleware_1.authMiddleware, substack_1.default);
app.use('/api/users', auth_middleware_1.authMiddleware, users_1.default);
// Root route
app.get('/', (req, res) => {
    res.send('10X Studio API is running');
});
// Start Cron
(0, cron_service_1.initCron)();
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`);
});
