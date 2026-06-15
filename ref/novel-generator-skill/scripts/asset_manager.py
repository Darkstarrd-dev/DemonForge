import os
import shutil
import argparse

SKILL_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(SKILL_ROOT, "data")

def cmd_list(args):
    print(f"[*] Available Assets in Skill Library:")
    
    # Characters
    char_dir = os.path.join(DATA_DIR, "characters")
    print("\n[Characters]")
    if os.path.exists(char_dir):
        for f in os.listdir(char_dir):
            if f.endswith(".md"):
                print(f"  - {f}")
    else:
        print("  (Empty)")

    # Worlds
    world_dir = os.path.join(DATA_DIR, "world")
    print("\n[World Settings]")
    if os.path.exists(world_dir):
        for f in os.listdir(world_dir):
            if f.endswith(".md"):
                print(f"  - {f}")
    else:
        print("  (Empty)")

def cmd_inject(args):
    workdir = args.workdir
    asset_name = args.name
    asset_type = args.type # char or world
    
    source_dir = os.path.join(DATA_DIR, "characters" if asset_type == "char" else "world")
    target_dir = os.path.join(workdir, "assets", "characters" if asset_type == "char" else "world")
    
    source_path = os.path.join(source_dir, asset_name)
    
    if not os.path.exists(source_path):
        print(f"[Error] Asset not found in library: {source_path}")
        return

    os.makedirs(target_dir, exist_ok=True)
    target_path = os.path.join(target_dir, asset_name)
    
    shutil.copy2(source_path, target_path)
    print(f"[Success] Injected '{asset_name}' into {target_path}")

def main():
    parser = argparse.ArgumentParser(description="Asset Manager")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # List
    subparsers.add_parser("list", help="List available assets")
    
    # Inject
    inj = subparsers.add_parser("inject", help="Inject asset into workdir")
    inj.add_argument("name", help="Filename (e.g., 'Shenyu.md')")
    inj.add_argument("--type", choices=["char", "world"], required=True)
    inj.add_argument("--workdir", required=True)

    args = parser.parse_args()
    
    if args.command == "list":
        cmd_list(args)
    elif args.command == "inject":
        cmd_inject(args)

if __name__ == "__main__":
    main()
