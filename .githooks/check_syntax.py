#!/usr/bin/env python3
"""Cheap syntax floor for staged files: a file that cannot parse must not reach a branch."""
import json, os, py_compile, sys, tempfile

def check(path):
    ext = os.path.splitext(path)[1].lower()
    try:
        if ext == ".py":
            py_compile.compile(path, cfile=tempfile.mktemp(), doraise=True)
        elif ext == ".json":
            json.load(open(path, encoding="utf-8"))
        elif ext in (".yaml", ".yml"):
            try:
                import yaml
            except ImportError:
                return None
            yaml.safe_load(open(path, encoding="utf-8"))
        elif ext == ".toml":
            import tomllib
            tomllib.load(open(path, "rb"))
        else:
            return None
    except Exception as e:
        return str(e)[:160]
    return None

def main():
    bad, skipped = [], 0
    for p in sys.argv[1:]:
        if not os.path.isfile(p):
            skipped += 1
            continue
        err = check(p)
        if err:
            bad.append((p, err))
    if bad:
        print("[gate/syntax] BLOCKED - staged file(s) do not parse:")
        for p, e in bad:
            print("   " + p + ": " + e)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
