import os
import sys
import json
import argparse

REQUIRED_FILES = [
    "Novel_architecture.txt",
    "Novel_directory.txt",
    "character_state.txt"
]

REQUIRED_DIRS = [
    ".novel_data/vector_store"
]

def check(workdir):
    report = {
        "status": "PASS",
        "missing": [],
        "details": {}
    }
    
    # Check Files
    for f in REQUIRED_FILES:
        path = os.path.join(workdir, f)
        exists = os.path.exists(path)
        report["details"][f] = "Found" if exists else "MISSING"
        if not exists:
            report["missing"].append(f)
            
    # Check Dirs
    for d in REQUIRED_DIRS:
        path = os.path.join(workdir, d)
        exists = os.path.exists(path)
        report["details"][d] = "Found" if exists else "MISSING"
        # Optional: Dirs might not be strict blockers
        
    if report["missing"]:
        report["status"] = "FAIL"
        
    print(json.dumps(report, indent=2, ensure_ascii=False))
    
    if report["status"] == "FAIL":
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--workdir", required=True)
    args = parser.parse_args()
    check(args.workdir)
