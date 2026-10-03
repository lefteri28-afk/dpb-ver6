"""
core/audit_chain.py

Implements the HMAC-SHA256 master audit chain (PPA Section 4.G) and the
local per-terminal offline hash chain (PPA Section 4.D):

    Block_m = HMAC(Key = K_term, Data = TxID || T_m || S_k(m) || Block_{m-1})

This module is deliberately a simple linear, append-only chain. A
Merkle-checkpoint alternative (PPA Section 5) can be layered on top of a
completed HmacChain by hashing its blocks into a Merkle tree; that is left
as a separate, optional module rather than built into this one, so teams
that only need the direct net-delta reconciliation path (Section 4.E) are
not forced to depend on Merkle-tree code they don't use.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass, field
from typing import Optional


GENESIS_HASH = "0" * 64  # parent hash for the first block in a chain


@dataclass(frozen=True)
class ChainBlock:
    """A single entry in an HMAC-chained audit log."""
    index: int
    timestamp: float
    payload: dict          # arbitrary event data (tx id, tier, event type, etc.)
    parent_hash: str
    signature: str          # HMAC-SHA256 hex digest of (payload || parent_hash)

    def to_dict(self) -> dict:
        return {
            "index": self.index,
            "timestamp": self.timestamp,
            "payload": self.payload,
            "parent_hash": self.parent_hash,
            "signature": self.signature,
        }


def _canonical_payload_bytes(payload: dict, parent_hash: str) -> bytes:
    """
    Deterministic serialization so the same logical payload always
    produces the same signature, regardless of dict key insertion order.
    """
    combined = {"payload": payload, "parent_hash": parent_hash}
    return json.dumps(combined, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sign_block(key: bytes, payload: dict, parent_hash: str) -> str:
    data = _canonical_payload_bytes(payload, parent_hash)
    return hmac.new(key, data, hashlib.sha256).hexdigest()


def verify_block(key: bytes, block: ChainBlock) -> bool:
    expected = sign_block(key, block.payload, block.parent_hash)
    return hmac.compare_digest(expected, block.signature)


@dataclass
class HmacChain:
    """
    An append-only, HMAC-SHA256-chained audit log.

    Used both for:
      - the server-side master audit chain (PPA Section 4.G), and
      - a terminal's local offline chain during a disconnection episode
        (PPA Section 4.D), later reconciled per Section 4.E.
    """
    key: bytes
    blocks: list = field(default_factory=list)

    @property
    def head_hash(self) -> str:
        if not self.blocks:
            return GENESIS_HASH
        return self.blocks[-1].signature

    def append(self, payload: dict, timestamp: Optional[float] = None) -> ChainBlock:
        parent = self.head_hash
        ts = timestamp if timestamp is not None else time.time()
        sig = sign_block(self.key, payload, parent)
        block = ChainBlock(
            index=len(self.blocks),
            timestamp=ts,
            payload=payload,
            parent_hash=parent,
            signature=sig,
        )
        self.blocks.append(block)
        return block

    def verify_all(self) -> bool:
        """
        Verifies the full chain: every block's signature is valid, and
        every block's parent_hash correctly references the previous
        block's signature.
        """
        expected_parent = GENESIS_HASH
        for block in self.blocks:
            if block.parent_hash != expected_parent:
                return False
            if not verify_block(self.key, block):
                return False
            expected_parent = block.signature
        return True

    def to_list(self) -> list:
        return [b.to_dict() for b in self.blocks]
