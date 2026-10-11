import { DPBVer6RoundingEngine, CoinTier } from './roundingEngine';

export function runSimulation() {
    const engine = new DPBVer6RoundingEngine('nickel');
    let binRemainder = 0;
    let vault = 0;

    const sampleTransactions = [17.07, 5.81, 24.03, 7.78, 22.98];

    console.log('--- DPB Ver 6 Simulation Run ---');
    for (const raw of sampleTransactions) {
        const result = engine.processTransaction(raw, binRemainder, vault);
        binRemainder = result.binRemainder;
        vault = result.communityVaultBalance;
        console.log(`Raw: $${raw.toFixed(2)} | Rounded: $${result.roundedAmount.toFixed(2)} | Action: ${result.actionType} (${result.remainderDelta}) | Bin: $${binRemainder.toFixed(2)} | Vault: $${vault.toFixed(2)}`);
    }
}

if (require.main === module) {
    runSimulation();
}
