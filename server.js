import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
const SERVER_HMAC_SECRET = 'dpb_sec_key_998877665544332211';
// ==========================================
// 1. DYNAMIC VER6 DIGITAL PENNY BIN LEDGER CLASS
// ==========================================
export class PennyBinLedger {
    binBalance;
    auditLogs;
    latestHash;
    step;
    constructor(initialStep = 5) {
        this.binBalance = 0;
        this.auditLogs = [];
        this.latestHash = '0000000000000000000000000000000000000000000000000000000000000000';
        this.step = initialStep;
    }
    setConfiguration(newStep) {
        this.step = newStep;
        this.binBalance = 0;
    }
    getConfig() {
        return { step: this.step, maxCap: this.step - 1 };
    }
    getBalance() {
        return this.binBalance;
    }
    getLogs() {
        return this.auditLogs;
    }
    logTransaction(type, cents, action, adjustment, customId) {
        const txId = customId || 'tx_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        const timestamp = new Date().toLocaleTimeString();
        const payload = this.latestHash + '|' + txId + '|' + timestamp + '|' + type + '|' + cents + '|' + action + '|' + adjustment + '|' + this.binBalance;
        const currentHash = crypto
            .createHmac('sha256', SERVER_HMAC_SECRET)
            .update(payload)
            .digest('hex');
        const entry = {
            id: txId,
            timestamp: timestamp,
            type: type,
            fractionalCents: cents,
            action: action,
            adjustmentCents: adjustment,
            binBalanceAfter: this.binBalance,
            previousHash: this.latestHash,
            hash: currentHash
        };
        this.latestHash = currentHash;
        this.auditLogs.unshift(entry);
        if (this.auditLogs.length > 50)
            this.auditLogs.pop();
        return entry;
    }
    verifyIntegrity() {
        if (this.auditLogs.length === 0)
            return { isValid: true };
        const chronologicalLogs = [...this.auditLogs].reverse();
        for (let i = 0; i < chronologicalLogs.length; i++) {
            const log = chronologicalLogs[i];
            const payload = log.previousHash + '|' + log.id + '|' + log.timestamp + '|' + log.type + '|' + log.fractionalCents + '|' + log.action + '|' + log.adjustmentCents + '|' + log.binBalanceAfter;
            const expectedHash = crypto
                .createHmac('sha256', SERVER_HMAC_SECRET)
                .update(payload)
                .digest('hex');
            if (expectedHash !== log.hash) {
                return { isValid: false, brokenAtId: log.id };
            }
        }
        return { isValid: true };
    }
    updateBin(transactionRemainder) {
        const maxCap = this.step - 1;
        if (!Number.isInteger(transactionRemainder) || transactionRemainder < 0 || transactionRemainder > maxCap) {
            throw new Error(`Invalid transaction value: must be between 0 and ${maxCap} for step ${this.step}`);
        }
        if (this.binBalance < 0 || this.binBalance > maxCap) {
            throw new Error("Fatal: Core bin balance corrupted");
        }
        if (this.binBalance >= transactionRemainder) {
            this.binBalance = this.binBalance - transactionRemainder;
            if (this.binBalance < 0)
                this.binBalance = 0;
            return "ROUND_DOWN";
        }
        else {
            const creditAmount = this.step - transactionRemainder;
            this.binBalance = this.binBalance + creditAmount;
            if (this.binBalance > maxCap)
                this.binBalance = maxCap;
            return "ROUND_UP";
        }
    }
}
// ==========================================
// 2. THE PRIVATE SERVER ROUTING API (VER6)
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());
const communityBin = new PennyBinLedger(5);
app.get('/', (req, res) => {
    const config = communityBin.getConfig();
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Digital Penny Bin Ver6 Simulator</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f4f6f8; margin: 0; padding: 40px; display: flex; flex-direction: column; align-items: center; gap: 24px; }
        .card { background: white; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); padding: 24px; width: 100%; max-width: 680px; box-sizing: border-box; }
        h2 { margin-top: 0; color: #1a1f36; font-size: 20px; border-bottom: 2px solid #f4f6f8; padding-bottom: 12px;}
        .form-group { margin-bottom: 16px; }
        label { display: block; margin-bottom: 8px; font-weight: 600; color: #4f566b; font-size: 14px; }
        input[type="number"], select { width: 100%; padding: 12px; border: 1px solid #a5aab5; border-radius: 6px; font-size: 16px; box-sizing: border-box; font-weight: bold; background: white; }
        button { width: 100%; background-color: #5469d4; color: white; border: none; padding: 14px; border-radius: 6px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background 0.15s; margin-bottom: 10px; }
        button:hover { background-color: #0048b5; }
        .btn-random { background-color: #6b5b95; }
        .btn-random:hover { background-color: #514375; }
        .bin-container { display: flex; flex-direction: column; align-items: center; justify-content: center; background: #fffdeb; border: 2px dashed #e3b000; border-radius: 12px; padding: 24px; text-align: center; }
        .bin-visual { font-size: 56px; margin-bottom: 6px; }
        .bin-count { font-size: 32px; font-weight: bold; color: #b28000; }
        .log-box { margin-top: 15px; background: #f8f9fa; border: 1px solid #e3e8ee; border-radius: 6px; padding: 12px; font-size: 14px; color: #3c4257; min-height: 60px; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; color: white; }
        .badge-up { background-color: #e56b6f; }
        .badge-down { background-color: #2ec4b6; }
        .badge-reconciled { background-color: #6b5b95; }
        .badge-exact { background-color: #a5aab5; }
        .hash-code { font-family: monospace; font-size: 11px; color: #697386; background: #f4f6f8; padding: 2px 6px; border-radius: 4px; }
        
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; text-align: left; }
        th { background-color: #f8f9fa; color: #4f566b; padding: 10px; border-bottom: 2px solid #e3e8ee; }
        td { padding: 10px; border-bottom: 1px solid #e3e8ee; color: #3c4257; }
        tr:nth-child(even) { background-color: #fafbfc; }
        .table-container { max-height: 250px; overflow-y: auto; border: 1px solid #e3e8ee; border-radius: 6px; }
    </style>
</head>
<body>
    <div class="card">
        <h2>⚙️ DPB Ver6 Engine Configuration</h2>
        <div class="form-group">
            <label for="engineSelect">Select Coin Engine / Target Denomination:</label>
            <select id="engineSelect" onchange="updateEngineConfig()">
                <option value="5" ${config.step === 5 ? 'selected' : ''}>Nickel Engine (Rounds to nearest 5¢, Cap: 4¢)</option>
                <option value="10" ${config.step === 10 ? 'selected' : ''}>Dime Engine (Rounds to nearest 10¢, Cap: 9¢)</option>
                <option value="25" ${config.step === 25 ? 'selected' : ''}>Quarter Engine (Rounds to nearest 25¢, Cap: 24¢)</option>
                <option value="100" ${config.step === 100 ? 'selected' : ''}>Dollar Engine (Rounds to nearest $1.00, Cap: 99¢)</option>
            </select>
        </div>
    </div>

    <div class="card">
        <h2>🖥️ POS Checkout Register</h2>
        <div class="form-group">
            <label for="billAmount">Enter Sale Total ($):</label>
            <input type="number" id="billAmount" step="0.01" value="10.02" min="0.01">
        </div>
        <button type="button" class="btn-random" onclick="generateRandomTransaction()">🎲 Generate Random Transaction</button>
        <button type="button" onclick="processCheckout()">Trigger Checkout</button>
        <button type="button" id="networkBtn" onclick="toggleNetworkMode()" style="background-color: #4f566b; margin-bottom: 0; font-weight: bold;">DISCONNECT LINK</button>
        <div id="receiptLog" class="log-box" style="display: none;"></div>
    </div>

    <div class="card">
        <h2>🍯 Shared Community Bin (Ver6)</h2>
        <div class="bin-container">
            <div class="bin-visual">🪙</div>
            <div id="binTally" class="bin-count">${communityBin.getBalance()}¢</div>
            <span id="maxCapLabel" style="color: #697386; font-size: 12px; font-weight: 600; margin-top: 4px;">MAX CAP: ${config.maxCap}¢</span>
        </div>
        <div id="queueStatus" style="margin-top: 12px; font-size: 13px; font-weight: bold; color: #697386; text-align: center;">Queued Offline Tx: 0</div>
    </div>

    <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f4f6f8; padding-bottom: 12px;">
            <h2 style="margin: 0; border: none; padding: 0;">🔒 Cryptographic Audit Log</h2>
            <button type="button" onclick="verifyIntegrity()" style="width: auto; padding: 8px 14px; font-size: 12px; background-color: #2ec4b6; margin: 0;">VERIFY CHAIN</button>
        </div>
        <div id="chainStatus" style="margin-top: 10px; font-size: 13px; font-weight: bold; color: #2ec4b6; display: none;"></div>
        <div class="table-container" style="margin-top: 10px;">
            <table>
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Type</th>
                        <th>Remainder</th>
                        <th>Action</th>
                        <th>Bin</th>
                        <th>HMAC Signature (SHA-256)</th>
                    </tr>
                </thead>
                <tbody id="auditTableBody">
                    <tr><td colspan="6" style="text-align: center; color: #8792a2;">No signed entries logged yet.</td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <script>
        let isOfflineMode = localStorage.getItem('dpb_is_offline') === 'true';
        let localOfflineBin = 0;
        let currentStep = ${config.step};

        async function updateEngineConfig() {
            const select = document.getElementById('engineSelect');
            const newStep = parseInt(select.value);
            
            try {
                const res = await fetch('/api/pos/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ step: newStep })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    currentStep = data.step;
                    document.getElementById('binTally').innerText = data.balance + '¢';
                    document.getElementById('maxCapLabel').innerText = 'MAX CAP: ' + data.maxCap + '¢';
                    clearOfflineQueue();
                    localOfflineBin = 0;
                    fetchAuditLogs();
                    alert('Engine updated successfully! Ledger reset to step size: ' + data.step + '¢');
                }
            } catch (err) {
                console.error("Failed to update engine config", err);
            }
        }

        function generateRandomTransaction() {
            const randomDollars = Math.floor(Math.random() * 95) + 5;
            const randomCents = Math.floor(Math.random() * 100);
            const randomTotal = randomDollars + (randomCents / 100);
            document.getElementById('billAmount').value = randomTotal.toFixed(2);
        }

        function getOfflineQueue() {
            return JSON.parse(localStorage.getItem('dpb_offline_queue') || '[]');
        }

        function saveToOfflineQueue(tx) {
            const queue = getOfflineQueue();
            queue.push(tx);
            localStorage.setItem('dpb_offline_queue', JSON.stringify(queue));
            updateQueueDisplay();
        }

        function clearOfflineQueue() {
            localStorage.removeItem('dpb_offline_queue');
            updateQueueDisplay();
        }

        function updateQueueDisplay() {
            const count = getOfflineQueue().length;
            document.getElementById('queueStatus').innerText = 'Queued Offline Tx: ' + count;
        }

        function updateNetworkUI() {
            const btn = document.getElementById('networkBtn');
            if (isOfflineMode) {
                btn.innerText = 'GO OFFLINE';
                btn.style.backgroundColor = '#e56b6f';
            } else {
                btn.innerText = 'DISCONNECT LINK';
                btn.style.backgroundColor = '#4f566b';
            }
        }

        async function fetchAuditLogs() {
            try {
                const res = await fetch('/api/pos/logs');
                const data = await res.json();
                renderLogsTable(data.logs);
            } catch (err) {
                console.error("Failed to fetch logs", err);
            }
        }

        async function verifyIntegrity() {
            try {
                const res = await fetch('/api/pos/verify');
                const data = await res.json();
                const statusDiv = document.getElementById('chainStatus');
                statusDiv.style.display = 'block';
                if (data.isValid) {
                    statusDiv.style.color = '#2ec4b6';
                    statusDiv.innerText = '✅ Cryptographic Chain Intact! All SHA-256 HMAC signatures verified successfully.';
                } else {
                    statusDiv.style.color = '#e56b6f';
                    statusDiv.innerText = '🚨 WARNING: Ledger Tampering Detected! Chain broken at ID: ' + data.brokenAtId;
                }
            } catch (err) {
                console.error("Verification failed", err);
            }
        }

        function renderLogsTable(logs) {
            const tbody = document.getElementById('auditTableBody');
            if (!logs || logs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #8792a2;">No signed entries logged yet.</td></tr>';
                return;
            }

            tbody.innerHTML = logs.map(function(log) {
                let badgeClass = 'badge-exact';
                if (log.action === 'ROUND_UP') badgeClass = 'badge-up';
                if (log.action === 'ROUND_DOWN') badgeClass = 'badge-down';
                if (log.type === 'BATCH_RECONCILED') badgeClass = 'badge-reconciled';

                let typeLabel = log.type;
                if (typeLabel === 'OFFLINE_CACHED') typeLabel = '⚠️ OFFLINE';

                let shortHash = log.hash ? log.hash.substring(0, 16) + '...' : 'NONE';

                return '<tr>' +
                    '<td>' + log.timestamp + '</td>' +
                    '<td><strong>' + typeLabel + '</strong></td>' +
                    '<td>' + log.fractionalCents + '¢</td>' +
                    '<td><span class="badge ' + badgeClass + '">' + log.action + '</span></td>' +
                    '<td><strong>' + log.binBalanceAfter + '¢</strong></td>' +
                    '<td><span class="hash-code" title="' + log.hash + '">' + shortHash + '</span></td>' +
                '</tr>';
            }).join('');
        }

        async function toggleNetworkMode() {
            isOfflineMode = !isOfflineMode;
            localStorage.setItem('dpb_is_offline', isOfflineMode);

            const btn = document.getElementById('networkBtn');
            if (isOfflineMode) {
                updateNetworkUI();
            } else {
                btn.innerText = 'RECONNECTING & SYNCING...';
                btn.style.backgroundColor = '#e3b000';
                await flushOfflineQueue();
                updateNetworkUI();
            }
        }

        async function flushOfflineQueue() {
            const queue = getOfflineQueue();
            if (queue.length === 0) return;

            try {
                const response = await fetch('/api/pos/batch-sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ batch: queue })
                });

                const data = await response.json();
                if (data.status === "success") {
                    clearOfflineQueue();
                    document.getElementById('binTally').innerText = data.finalBinBalance + '¢';
                    fetchAuditLogs();
                    alert('Reconnected! Synced and cryptographically signed ' + data.reconciledCount + ' offline transaction(s).');
                }
            } catch (err) {
                console.error("⚠️️ Sync failed.", err);
            }
        }

        async function processCheckout() {
            const billInput = document.getElementById('billAmount').value;
            const originalBill = parseFloat(billInput);
            if (isNaN(originalBill) || originalBill <= 0) return alert("Enter valid total.");
            
            const totalCents = Math.round(originalBill * 100);
            const fractionalCents = totalCents % currentStep;

            const receiptBox = document.getElementById('receiptLog');
            receiptBox.style.display = 'block';

            if (fractionalCents === 0) {
                receiptBox.innerHTML = '<span class="badge badge-exact">EXACT CHANGE</span><br>Original Ring: $' + originalBill.toFixed(2) + '<br><strong>Amount Paid: $' + originalBill.toFixed(2) + '</strong>';
                return;
            }

            if (isOfflineMode) {
                let action = "ROUND_UP";
                let difference = currentStep - fractionalCents;
                const maxCap = currentStep - 1;

                if (localOfflineBin >= fractionalCents) {
                    action = "ROUND_DOWN";
                    difference = fractionalCents;
                    localOfflineBin = localOfflineBin - fractionalCents;
                    if (localOfflineBin < 0) localOfflineBin = 0;
                } else {
                    localOfflineBin = localOfflineBin + (currentStep - fractionalCents);
                    if (localOfflineBin > maxCap) localOfflineBin = maxCap;
                }

                saveToOfflineQueue({
                    id: 'tx_' + Date.now(),
                    transactionCents: fractionalCents,
                    timestamp: Date.now()
                });

                document.getElementById('binTally').innerHTML = localOfflineBin + '¢ <span style="font-size: 12px; color: red; display: block; font-weight: bold;">⚠️ OFFLINE CACHE</span>';
                
                let adjustedBill = action === "ROUND_DOWN" ? originalBill - (difference / 100) : originalBill + (difference / 100);
                let actionBadge = action === "ROUND_DOWN" ? '<span class="badge badge-down">OFFLINE DEDUCT (-' + difference + '¢)</span>' : '<span class="badge badge-up">OFFLINE CREDIT (+' + difference + '¢)</span>';
                
                receiptBox.innerHTML = actionBadge + '<br>Original Ring: $' + originalBill.toFixed(2) + '<br><strong>Amount Paid (Stored Locally): $' + adjustedBill.toFixed(2) + '</strong>';
                return;
            }

            try {
                const response = await fetch('/api/pos/transaction', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transactionCents: fractionalCents })
                });
                
                const data = await response.json();
                
                if (data.status === "success") {
                    document.getElementById('binTally').innerText = data.currentBinBalance + '¢';
                    let adjustedBill = data.action === "ROUND_DOWN" ? originalBill - (data.adjustmentCents / 100) : originalBill + (data.adjustmentCents / 100);
                    let actionBadge = data.action === "ROUND_DOWN" ? '<span class="badge badge-down">ROUND DOWN (-' + data.adjustmentCents + '¢)</span>' : '<span class="badge badge-up">ROUND UP (+' + data.adjustmentCents + '¢)</span>';
                    receiptBox.innerHTML = actionBadge + '<br>Original Ring: $' + originalBill.toFixed(2) + '<br><strong>Amount Paid: $' + adjustedBill.toFixed(2) + '</strong><br><span style="font-size: 11px; color: #697386;">HMAC: ' + data.signature.substring(0, 20) + '...</span>';
                    fetchAuditLogs();
                }
            } catch (err) { 
                console.warn("⚠️ Disconnected! Engaging SAF Mode.");
                isOfflineMode = true;
                localStorage.setItem('dpb_is_offline', true);
                localOfflineBin = 0; 
                updateNetworkUI();
                processCheckout(); 
            }
        }

        updateQueueDisplay();
        fetchAuditLogs();
        updateNetworkUI();
    </script>
</body>
</html>
  `);
});
app.post('/api/pos/config', (req, res) => {
    const { step } = req.body;
    if (!step || ![5, 10, 25, 100].includes(step)) {
        res.status(400).json({ error: "Invalid step size configuration" });
        return;
    }
    communityBin.setConfiguration(step);
    const config = communityBin.getConfig();
    res.status(200).json({
        status: 'success',
        step: config.step,
        maxCap: config.maxCap,
        balance: communityBin.getBalance()
    });
});
app.get('/api/pos/logs', (req, res) => {
    res.status(200).json({ logs: communityBin.getLogs() });
});
app.get('/api/pos/verify', (req, res) => {
    res.status(200).json(communityBin.verifyIntegrity());
});
app.post('/api/pos/transaction', (req, res) => {
    try {
        const { transactionCents } = req.body;
        const config = communityBin.getConfig();
        if (transactionCents === undefined || !Number.isInteger(transactionCents) || transactionCents < 0 || transactionCents > config.maxCap) {
            res.status(400).json({ error: "Invalid fractional cent payload for current engine step" });
            return;
        }
        if (transactionCents === 0) {
            res.status(200).json({ status: "success", action: "EXACT_CHANGE", adjustmentCents: 0, currentBinBalance: communityBin.getBalance() });
            return;
        }
        const action = communityBin.updateBin(transactionCents);
        const difference = action === "ROUND_DOWN" ? transactionCents : (config.step - transactionCents);
        const entry = communityBin.logTransaction('ONLINE', transactionCents, action, difference);
        res.status(200).json({
            status: "success",
            action: action,
            adjustmentCents: difference,
            currentBinBalance: communityBin.getBalance(),
            signature: entry.hash
        });
    }
    catch (error) {
        res.status(500).json({ error: "Internal failure" });
    }
});
app.post('/api/pos/batch-sync', (req, res) => {
    try {
        const { batch } = req.body;
        const config = communityBin.getConfig();
        if (!Array.isArray(batch) || batch.length === 0) {
            res.status(400).json({ error: "Invalid or empty batch payload" });
            return;
        }
        const processedResults = [];
        for (const tx of batch) {
            const cents = tx.transactionCents;
            if (!Number.isInteger(cents) || cents < 0 || cents > config.maxCap)
                continue;
            if (cents === 0)
                continue;
            const action = communityBin.updateBin(cents);
            const difference = action === "ROUND_DOWN" ? cents : (config.step - cents);
            const entry = communityBin.logTransaction('BATCH_RECONCILED', cents, action, difference, tx.id);
            processedResults.push({ id: tx.id, status: "RECONCILED", action, adjustmentCents: difference, signature: entry.hash });
        }
        res.status(200).json({
            status: "success",
            reconciledCount: processedResults.length,
            finalBinBalance: communityBin.getBalance()
        });
    }
    catch (error) {
        res.status(500).json({ error: "Batch reconciliation failure" });
    }
});
app.listen(3000, () => console.log('🚀 Digital Penny Bin Ver6 Server running on port 3000'));
