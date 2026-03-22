"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const substack_service_1 = require("./services/substack.service");
const fs_1 = __importDefault(require("fs"));
async function checkTranslationOutput() {
    const dummyPayload = {
        type: "doc",
        content: [
            {
                type: "paragraph",
                content: [{ type: "text", text: "Hello" }]
            },
            {
                type: "subscribe_widget"
            }
        ]
    };
    const parsed = substack_service_1.SubstackService.injectSubstackSchema(dummyPayload);
    fs_1.default.writeFileSync('diag_output.json', JSON.stringify(parsed, null, 2));
    console.log("Translation parsed perfectly.");
}
checkTranslationOutput();
