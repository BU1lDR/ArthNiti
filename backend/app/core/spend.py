"""A ceiling on what this app asks Meta to bill.

The owner has a free credit and no budget beyond it, so every call to Meta is
charged here first, at a price that is too high rather than too low, and a call
that would pass the ceiling is refused before it leaves this machine. The total
is a file and not a counter in memory, so a restart cannot reset it.

It bounds this app only. It cannot see credit spent anywhere else (the dashboard
playgrounds, another program holding the same key), and Meta's own spend limit
is an email alert, not a block.
"""

import math
import re
import threading
from pathlib import Path

from app.core.meta_client import MetaError

# The ledger counts whole millionths of a dollar, so sums are exact integers.
MICRO = 1_000_000


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


class SpendCap:
    def __init__(self, path, cap_usd):
        if not _is_number(cap_usd) or not math.isfinite(cap_usd) or round(cap_usd * MICRO) < 1:
            raise ValueError(f"The spend cap must be a number of dollars above zero, got {cap_usd!r}.")

        self._path = Path(path)
        self._cap = round(cap_usd * MICRO)
        self._lock = threading.Lock()

        if not self._path.parent.is_dir():
            raise ValueError(f"The folder for the spend ledger does not exist: {self._path.parent}")

        # A ledger that cannot be read stops the start and not the first call.
        self._total()

    def spent_usd(self):
        return self._total() / MICRO

    def charge(self, usd):
        """Record usd, rounded up to a whole micro-dollar, or raise MetaError("spend_cap").

        Nothing is recorded when it raises. A ledger that cannot be read or
        written refuses the call: not knowing the total is not a reason to spend.
        """
        if not _is_number(usd) or not math.isfinite(usd) or usd < 0:
            raise MetaError("spend_cap", detail=f"{usd!r} is not an amount of money")

        micro = math.ceil(usd * MICRO)

        # ponytail: one lock per process, and the file is summed again on every
        # charge. Several worker processes can each overshoot by one call.
        with self._lock:
            try:
                total = self._total()

                if total + micro > self._cap:
                    raise MetaError(
                        "spend_cap",
                        detail=f"cap ${self._cap / MICRO:.2f}, recorded ${total / MICRO:.2f}, this call ${micro / MICRO:.4f}",
                    )

                with open(self._path, "a", encoding="utf-8", newline="\n") as ledger:
                    ledger.write(f"{micro}\n")
            except (OSError, ValueError) as error:
                raise MetaError("spend_cap", detail=str(error)) from error

    def _total(self):
        try:
            text = self._path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return 0
        except (OSError, UnicodeDecodeError) as error:
            raise ValueError(f"The spend ledger {self._path} cannot be read: {error}") from error

        entries = text.split()

        # Fifteen digits is a billion dollars: longer is damage, not a total.
        if not all(re.fullmatch("[0-9]{1,15}", entry) for entry in entries):
            raise ValueError(f"The spend ledger {self._path} must hold whole numbers, one per line.")

        return sum(int(entry) for entry in entries)
