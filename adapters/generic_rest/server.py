import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from core.ledger import PENNY_BIN, NICKEL_BIN, DIME_BIN, QUARTER_BIN
from core.reconciliation import LedgerServer

TIER_MAP = {
    "penny_bin": PENNY_BIN,
    "nickel_bin": NICKEL_BIN,
    "dime_bin": DIME_BIN,
    "quarter_bin": QUARTER_BIN,
}

server_engine = LedgerServer(ceiling_cents=99, audit_key=b"demo_secret_key_1234")

HTML_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>DPB Terminal Dashboard</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 760px; margin: 40px auto; padding: 0 20px; background: #0f172a; color: #f8fafc; }
    .card { background: #1e293b; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); }
    h1 { margin-top: 0; font-size: 1.6rem; color: #38bdf8; }
    .metric { font-size: 2.4rem; font-weight: bold; color: #4ade80; }
    .subtext { font-size: 0.9rem; color: #94a3b8; }
    label { display: block; margin: 12px 0 4px; font-weight: 500; font-size: 0.9rem; }
    input, select, button { width: 100%; padding: 10px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #f8fafc; box-sizing: border-box; font-size: 1rem; }
    button { margin-top: 18px; background: #2563eb; font-weight: 600; cursor: pointer; border: none; transition: background 0.2s; }
    button:hover { background: #1d4ed8; }
    pre { background: #090d16; padding: 12px; border-radius: 6px; overflow-x: auto; color: #e2e8f0; font-size: 0.85rem; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 0.8rem; font-weight: bold; }
    .badge-ok { background: #166534; color: #86efac; }
  </style>
</head>
<body>
  <h1>Digital Penny Bin — Live Pool</h1>

  <div class="card">
    <div class="subtext">SHARED LEDGER POOL BALANCE</div>
    <div class="metric" id="balanceDisplay">--¢</div>
    <div class="subtext" style="margin-top: 8px;">
      Ceiling: <span id="ceilingDisplay">--</span>¢ | Audit Chain Status: <span id="auditDisplay" class="badge badge-ok">--</span>
    </div>
  </div>

  <div class="card">
    <h2 style="font-size: 1.2rem; margin-top: 0;">Submit Register Transaction</h2>
    
    <label for="terminalId">Terminal ID</label>
    <input type="text" id="terminalId" value="register_lane_1" />

    <label for="tierSelect">POS Rounding Tier</label>
    <select id="tierSelect">
      <option value="penny_bin">Penny Bin (5¢ Unit)</option>
      <option value="nickel_bin">Nickel Bin (10¢ Unit)</option>
      <option value="dime_bin">Dime Bin (25¢ Unit)</option>
      <option value="quarter_bin" selected>Quarter Bin (100¢ / $1.00 Unit)</option>
    </select>

    <label for="amountCents">Transaction Amount (in Cents, e.g., 1097 = $10.97)</label>
    <input type="number" id="amountCents" value="1097" />

    <button onclick="submitTransaction()">Process Transaction</button>
  </div>

  <div class="card">
    <h2 style="font-size: 1.2rem; margin-top: 0;">Decision Result</h2>
    <pre id="outputLog">Awaiting transaction...</pre>
  </div>

  <script>
    async function refreshStatus() {
      try {
        const res = await fetch('/status');
        const data = await res.json();
        document.getElementById('balanceDisplay').innerText = data.balance_cents + '¢';
        document.getElementById('ceilingDisplay').innerText = data.ceiling_cents;
        document.getElementById('auditDisplay').innerText = data.audit_chain_valid ? 'VALID (HMAC)' : 'COMPROMISED';
      } catch (e) {
        console.error('Failed fetching pool status', e);
      }
    }

    async function submitTransaction() {
      const payload = {
        terminal_id: document.getElementById('terminalId').value,
        tier: document.getElementById('tierSelect').value,
        amount_cents: parseInt(document.getElementById('amountCents').value, 10)
      };

      try {
        const res = await fetch('/transaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        document.getElementById('outputLog').innerText = JSON.stringify(result, null, 2);
        refreshStatus();
      } catch (e) {
        document.getElementById('outputLog').innerText = 'Error: ' + e.message;
      }
    }

    refreshStatus();
  </script>
</body>
</html>
"""

class DPBHandler(BaseHTTPRequestHandler):
    def _send(self, code: int, ctype: str, body: bytes):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self._send(200, "text/html; charset=utf-8", HTML_PAGE.encode("utf-8"))
        elif self.path == "/status":
            payload = {
                "balance_cents": server_engine.balance_cents,
                "ceiling_cents": server_engine.ceiling_cents,
                "audit_chain_valid": server_engine.verify_audit_chain(),
            }
            self._send(200, "application/json", json.dumps(payload).encode("utf-8"))
        else:
            self._send(404, "application/json", b'{"error":"Not found"}')

    def do_POST(self):
        if self.path == "/transaction":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
                tier = TIER_MAP[data.get("tier", "quarter_bin")]
                res = server_engine.process_online_transaction(
                    terminal_id=data.get("terminal_id", "term_default"),
                    tier=tier,
                    amount_cents=int(data["amount_cents"]),
                )
                payload = {
                    "event_type": res.event_type.value,
                    "tail_cents": res.tail_cents,
                    "delta_cents": res.delta_cents,
                    "overflow_cents": res.overflow_cents,
                    "discount_granted": res.discount_granted,
                    "new_balance_cents": res.new_balance_cents,
                    "new_version": res.new_version,
                }
                self._send(200, "application/json", json.dumps(payload).encode("utf-8"))
            except Exception as e:
                self._send(400, "application/json", json.dumps({"error": str(e)}).encode("utf-8"))
        else:
            self._send(404, "application/json", b'{"error":"Not found"}')

if __name__ == "__main__":
    print("Serving UI at http://127.0.0.1:8000 ... (Press Ctrl+C to stop)")
    HTTPServer(("0.0.0.0", 8000), DPBHandler).serve_forever()
