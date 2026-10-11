export type CoinTier = 'nickel' | 'dime' | 'quarter' | 'dollar';

export interface TierConfig {
    increment: number;
    maxAccumulation: number;
}

export const TIER_CONFIGS: Record<CoinTier, TierConfig> = {
    nickel:  { increment: 0.05, maxAccumulation: 0.04 },
    dime:    { increment: 0.10, maxAccumulation: 0.09 },
    quarter: { increment: 0.25, maxAccumulation: 0.24 },
    dollar:  { increment: 1.00, maxAccumulation: 0.99 }
};

export interface RoundingResult {
    rawAmount: number;
    roundedAmount: number;
    remainderDelta: number;
    binRemainder: number;
    communityVaultBalance: number;
    vaultBoost: number;
    actionType: 'TAKE' | 'GIVE' | 'EXACT';
}

export class DPBVer6RoundingEngine {
    private config: TierConfig;

    constructor(tier: CoinTier = 'nickel') {
        this.config = TIER_CONFIGS[tier];
        if (!this.config) {
            throw new Error(`Unsupported coin tier: ${tier}`);
        }
    }

    public processTransaction(
        rawAmount: number,
        currentBinRemainder: number,
        currentCommunityVault: number
    ): RoundingResult {
        const { increment, maxAccumulation } = this.config;

        const floorVal = Number((Math.floor(rawAmount / increment) * increment).toFixed(2));
        const ceilVal = Number((Math.ceil(rawAmount / increment) * increment).toFixed(2));

        const fractionalPortionDown = Number((rawAmount - floorVal).toFixed(2));
        const differenceUp = Number((ceilVal - rawAmount).toFixed(2));

        let roundedAmount = floorVal;
        let delta = 0;
        let actionType: 'TAKE' | 'GIVE' | 'EXACT' = 'EXACT';

        if (fractionalPortionDown === 0) {
            roundedAmount = floorVal;
            delta = 0;
            actionType = 'EXACT';
        } else if (currentBinRemainder >= fractionalPortionDown) {
            roundedAmount = floorVal;
            delta = Number((-fractionalPortionDown).toFixed(2));
            actionType = 'TAKE';
        } else {
            roundedAmount = ceilVal;
            delta = Number(differenceUp.toFixed(2));
            actionType = 'GIVE';
        }

        const tentativeRemainder = Number((currentBinRemainder + delta).toFixed(2));

        let finalRemainder: number;
        let vaultAddition = 0.00;

        if (Math.abs(tentativeRemainder) > maxAccumulation) {
            vaultAddition = Number(increment.toFixed(2));
            finalRemainder = Number((tentativeRemainder - (tentativeRemainder > 0 ? increment : -increment)).toFixed(2));
        } else {
            finalRemainder = tentativeRemainder;
        }

        const newCommunityVault = Number((currentCommunityVault + vaultAddition).toFixed(2));

        return {
            rawAmount,
            roundedAmount,
            remainderDelta: delta,
            binRemainder: finalRemainder,
            communityVaultBalance: newCommunityVault,
            vaultBoost: vaultAddition,
            actionType
        };
    }
}
