import express, { Request, Response } from 'express';
import cors from 'cors';
import { DPBVer6RoundingEngine, CoinTier } from './roundingEngine';

const app = express();
app.use(express.json());
app.use(cors());

app.post('/api/rounding', (req: Request, res: Response) => {
    try {
        const { rawAmount, currentBinRemainder, currentCommunityVault, tier } = req.body;
        const engine = new DPBVer6RoundingEngine((tier as CoinTier) || 'nickel');
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

app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'healthy', service: 'dpb-ver6' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`DPB ver6 simulator running on port ${PORT}`);
});
