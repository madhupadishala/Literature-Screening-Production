"""Partial-date handling. PV source text routinely gives only year or month.
Comparisons are three-valued (True/False/None=cannot tell) so rules never guess."""
from __future__ import annotations
import re
from datetime import date
from calendar import monthrange

_RX = re.compile(r"^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$")

def parse(s):
    if not s: return None
    m = _RX.match(s.strip())
    if not m: return None
    y = int(m[1]); mo = int(m[2]) if m[2] else None; d = int(m[3]) if m[3] else None
    if mo is not None and not 1 <= mo <= 12: return None
    if d is not None and not 1 <= d <= monthrange(y, mo or 1)[1]: return None
    return y, mo, d

def bounds(s):
    p = parse(s)
    if not p: return None
    y, mo, d = p
    if d: return date(y, mo, d), date(y, mo, d)
    if mo: return date(y, mo, 1), date(y, mo, monthrange(y, mo)[1])
    return date(y, 1, 1), date(y, 12, 31)

def before(a, b):
    """True if a is certainly before b, False if certainly not, None if ambiguous."""
    ba, bb = bounds(a), bounds(b)
    if not ba or not bb: return None
    if ba[1] < bb[0]: return True
    if ba[0] >= bb[1]: return False
    return None

def add_days(iso, n):
    return date.fromordinal(date.fromisoformat(iso).toordinal() + n).isoformat()
