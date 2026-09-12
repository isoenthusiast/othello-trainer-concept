#!/usr/bin/env python3
"""The commit gate: block a staged ADDED line that carries a credential VALUE.

Rule: a NAME reference is fine, a VALUE is not. `os.getenv("X")`, `process.env.X`,
`${VAR}`, `config.x` and bare ALL_CAPS names all pass - a false positive here is the number one
reason people start passing --no-verify, which turns the whole gate into theatre.
"""
import re, subprocess, sys

KEYWORD = re.compile(
    r"(?i)(password|passwd|pwd|secret|api[_-]?key|client[_-]?secret|access[_-]?token|"
    r"auth[_-]?token|private[_-]?key|connection[_-]?string|access[_-]?key)"
    r"\s*[:=]\s*[\"']?([A-Za-z0-9+/_\-]{16,})")
PEM = re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")
SAFE = re.compile(r"(os\.getenv|os\.environ|process\.env|getenv\(|ENV\[|config\.|settings\.|\$\{)")

def added_lines():
    diff = subprocess.run(["git","diff","--cached","--unified=0","--no-color"],
                          capture_output=True, text=True).stdout
    cur = None
    for ln in diff.splitlines():
        if ln.startswith("+++ b/"):
            cur = ln[6:]
        elif ln.startswith("+") and not ln.startswith("+++"):
            yield cur, ln[1:]


def main():
    files = set(sys.argv[1:])
    hits = []
    for path, line in added_lines():
        if files and path not in files:
            continue
        if PEM.search(line):
            hits.append((path, "private key block"))
            continue
        m = KEYWORD.search(line)
        if not m:
            continue
        val = m.group(2)
        if SAFE.search(line) or val.isupper() or len(set(val)) < 5:
            continue
        hits.append((path, "credential-looking value"))
    if hits:
        print("[gate/secrets] BLOCKED - staged lines look like real credentials:")
        for p, why in hits:
            print("   " + p + ": " + why)
        print("[gate/secrets] use a name reference (os.getenv / process.env / ${VAR}) instead.")
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
