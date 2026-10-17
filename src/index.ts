import express from 'express';
import cors from 'cors';
import path from 'path';
import { DPBVer6RoundingEngine } from './roundingEngine';

const app = express();
app.use(express.json());
app.use(cors());

// Serve static frontend files from current directory or dist
const publicPath = path.join(__dirname, '../src');
console.log('Serving static files from:', publicPath);
app.use(express.static(publicPath));
app.use(express.static(path.join(__dirname)));

app.post('/api/rounding', (req, res) => {
    try {
        const { rawAmount, currentBinRemainder, currentCommunityVault, tier } = req.body;
        const engine = new DPBVer6RoundingEngine(tier || 'nickel');
        const result = engine.processTransaction(
            Number(rawAmount), 
            Number(currentBinRemainder || 0), 
            Number(currentCommunityVault || 0)
        );
        res.json(result);
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'dpb-ver6' });
});

// SPA fallback route
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, '../src/index.html');
    res.sendFile(indexPath, (err) => {
        if (err) {
            res.status(404).send('Index file not found at: ' + indexPath);
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`DPB ver6 simulator running on port ${PORT}`);
});
