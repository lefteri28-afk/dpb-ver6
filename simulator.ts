import axios from 'axios';
<<<<<<< HEAD
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function checkBinStatus() {
  try {
    const res = await axios.get('http://localhost:3000/api/bin-status');
    return res.data;
  } catch (err) {
    console.log("❌ POS Connection Error: Unable to reach DPB server on port 3000.");
    process.exit(1);
  }
}

async function promptUser() {
  const status = await checkBinStatus();
  console.log(`\n🍯 Current Shared Community Bin Balance: [ ${status.binBalance}¢ / ${status.maxCap}¢ ]`);
  
  rl.question('🛒 Enter transaction amount (e.g., 15.78 or type "exit" to quit): ', async (input) => {
    if (input.toLowerCase() === 'exit') {
      console.log('Exiting DPB Simulator.');
      rl.close();
      process.exit(0);
    }

    const amount = parseFloat(input);
    if (isNaN(amount) || amount <= 0) {
      console.log('❌ Invalid amount. Please enter a valid dollar value (e.g., 10.23)');
      return promptUser();
    }

    try {
      const response = await axios.post('http://localhost:3000/api/simulate', { amount });
      const data = response.data;

      console.log(`✅ Server Response: [${data.action}]`);
      console.log(`   📈📉 Action: ${data.message}`);
      console.log(`💰 Final Adjusted Bill Paid at Counter: $${data.finalPaid.toFixed(2)}`);
      console.log(`🍯 New Shared Community Bin Balance: [ ${data.binBalance}¢ / ${status.maxCap}¢ ]`);
    } catch (err) {
      console.log(`❌ Error processing transaction with server.`);
    }

    promptUser();
  });
}

async function start() {
  console.log("=== Digital Penny Bin (DPB) Interactive POS Terminal ===");
  promptUser();
}

start();
=======

const SERVER_URL = 'http://localhost:3000/api/pos/transaction';
const SIMULATION_LOOPS = 5;
const DELAY_MS = 2500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function simulateCustomerCheckout(transactionId: number) {
  const randomFractionalCents = Math.floor(Math.random() * 5);
  const baseBillAmount = 10.00;
  const originalBill = baseBillAmount + (randomFractionalCents / 100);

  console.log(`\n================ [ CUSTOMER #${transactionId} ] ================`);
  console.log(`🛒 POS Total Rang Up: $${originalBill.toFixed(2)} (Fractional Cents: ${randomFractionalCents}¢)`);

  try {
    const response = await axios.post(SERVER_URL, { transactionCents: randomFractionalCents });
    const { action, adjustmentCents, currentBinBalance } = response.data;
    let finalBillAmount = originalBill;

    if (action === "ROUND_DOWN") {
      finalBillAmount = originalBill - (adjustmentCents / 100);
      console.log(`✅ Server Response: [${action}]`);
      console.log(`   📉 Action: Bin had enough pennies. Deducted ${adjustmentCents}¢ from the bin.`);
    } else if (action === "ROUND_UP") {
      finalBillAmount = originalBill + (adjustmentCents / 100);
      console.log(`✅ Server Response: [${action}]`);
      console.log(`   📈 Action: Bin was too low. Credited ${adjustmentCents}¢ overpayment to the bin.`);
    }

    console.log(`💰 Final Adjusted Bill Paid at Counter: $${finalBillAmount.toFixed(2)}`);
    console.log(`🍯 New Shared Community Bin Balance: [ ${currentBinBalance}¢ / 4¢ ]`);
  } catch (error: any) {
    console.error(`❌ POS Connection Error: ${error.message}`);
  }
}

async function runPOSSimulator() {
  console.log("🚀 Starting Digital Penny Bin Mock POS Terminal Simulator...");
  for (let i = 1; i <= SIMULATION_LOOPS; i++) {
    await simulateCustomerCheckout(i);
    if (i < SIMULATION_LOOPS) await sleep(DELAY_MS);
  }
  console.log("\n🏁 Simulation completed successfully.");
}

runPOSSimulator();
>>>>>>> 8c1e973f1f167fd454f18711667bcbc0a978a952
