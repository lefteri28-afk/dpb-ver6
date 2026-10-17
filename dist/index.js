"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const roundingEngine_1 = require("./roundingEngine");
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cors_1.default)());
app.post('/api/rounding', (req, res) => {
    try {
        const { rawAmount, currentBinRemainder, currentCommunityVault, tier } = req.body;
        const engine = new roundingEngine_1.DPBVer6RoundingEngine(tier || 'nickel');
        const result = engine.processTransaction(Number(rawAmount), Number(currentBinRemainder || 0), Number(currentCommunityVault || 0));
        res.json(result);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'dpb-ver6' });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`DPB ver6 simulator running on port ${PORT}`);
});
// Serve static frontend files and catch-all route for SPA
const path_1 = __importDefault(require("path"));
app.use(express_1.default.static(path_1.default.join(__dirname, 'dist')));
app.get('*', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, 'dist', 'index.html'));
});
