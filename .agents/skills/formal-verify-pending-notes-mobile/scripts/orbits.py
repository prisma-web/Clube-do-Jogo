import hashlib
import json
import sys

orbits = set()
for line in sys.stdin:
    if line.startswith('{"'):
        views = json.loads("[" + line.strip()[1:-1] + "]")
        orbits.add(hashlib.blake2b(min(views).encode(), digest_size=16).digest())
    elif line.startswith("Error") or "distinct states found" in line:
        sys.stderr.write(line)
with open(sys.argv[1], "wb") as out:
    out.write(b"".join(sorted(orbits)))
print(len(orbits))
