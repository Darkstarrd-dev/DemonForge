import os
import sys
import argparse
import json
import time
import requests
from typing import List, Optional
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS

# --- LM Studio Embeddings Client ---
class LMStudioEmbeddings(Embeddings):
    def __init__(self, base_url: str, model_name: str = "local-model"):
        self.base_url = base_url.rstrip('/') + "/embeddings"
        self.model_name = model_name

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        # Payload format compatible with OpenAI/LM Studio
        payload = {
            "input": texts,
            "model": self.model_name
        }
        try:
            response = requests.post(self.base_url, json=payload, headers={"Content-Type": "application/json"})
            response.raise_for_status()
            data = response.json()
            return [item['embedding'] for item in data['data']]
        except Exception as e:
            # Fallback: Try one by one if batch fails (robustness)
            print(f"  [Batch Error] {e}, retrying individually...")
            results = []
            for text in texts:
                try:
                    single_payload = {"input": text, "model": self.model_name}
                    res = requests.post(self.base_url, json=single_payload, headers={"Content-Type": "application/json"})
                    results.append(res.json()['data'][0]['embedding'])
                except Exception as inner_e:
                    print(f"    [Single Error] {inner_e}")
                    results.append([0.0] * 1024) # Padding to avoid crash
            return results

    def embed_query(self, text: str) -> List[float]:
        return self.embed_documents([text])[0]

# --- Core Logic ---

def get_db_path(workdir):
    return os.path.join(workdir, ".novel_data", "vector_store")

def get_global_db_path():
    # Return path to .opencode/skill/novel-generator/data/vector_store
    current_script = os.path.abspath(__file__)
    skill_root = os.path.dirname(os.path.dirname(current_script))
    return os.path.join(skill_root, "data", "vector_store")

def init_or_load_db(workdir, api_url):
    local_db_path = get_db_path(workdir)
    global_db_path = get_global_db_path()
    embeddings = LMStudioEmbeddings(base_url=api_url)
    
    # 1. Check Local
    if os.path.exists(os.path.join(local_db_path, "index.faiss")):
        print(f"[*] Loading LOCAL vector store: {local_db_path}")
        return FAISS.load_local(local_db_path, embeddings, allow_dangerous_deserialization=True)
    
    # 2. Check Global & Clone
    elif os.path.exists(os.path.join(global_db_path, "index.faiss")):
        print(f"[*] Local store not found. Cloning GLOBAL assets from: {global_db_path}")
        import shutil
        try:
            shutil.copytree(global_db_path, local_db_path)
            return FAISS.load_local(local_db_path, embeddings, allow_dangerous_deserialization=True)
        except Exception as e:
            print(f"[!] Failed to clone global DB: {e}")
            return None
            
    return None

def cmd_add(args):
    workdir = args.workdir
    files = args.files
    api_url = args.api_url
    
    print(f"[*] Processing files for workdir: {workdir}")
    
    # 1. Load Texts
    documents = []
    for file_path in files:
        if not os.path.exists(file_path):
            print(f"  [Warn] File not found: {file_path}")
            continue
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                text = f.read()
            documents.append(Document(page_content=text, metadata={"source": file_path}))
            print(f"  [Read] {file_path} ({len(text)} chars)")
        except Exception as e:
            print(f"  [Error] Reading {file_path}: {e}")

    if not documents:
        print("[!] No valid documents to process.")
        return

    # 2. Split
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=args.chunk_size,
        chunk_overlap=args.chunk_overlap,
        separators=["\n\n", "\n", "。", "！", "？", " ", ""]
    )
    splits = splitter.split_documents(documents)
    print(f"[*] Split into {len(splits)} chunks (Size: {args.chunk_size})")

    # 3. Vectorize & Save
    embeddings = LMStudioEmbeddings(base_url=api_url)
    db_path = get_db_path(workdir)
    
    vector_store = init_or_load_db(workdir, api_url)
    
    batch_size = args.batch_size
    total = len(splits)
    
    print(f"[*] Starting vectorization (Batch size: {batch_size})...")
    
    for i in range(0, total, batch_size):
        batch = splits[i : i + batch_size]
        print(f"  > Processing batch {i//batch_size + 1}/{(total + batch_size - 1)//batch_size}...")
        
        try:
            if vector_store is None:
                vector_store = FAISS.from_documents(batch, embeddings)
            else:
                vector_store.add_documents(batch)
            
            # Real-time Save
            os.makedirs(db_path, exist_ok=True)
            vector_store.save_local(db_path)
            
        except Exception as e:
            print(f"  [Error] Batch failed: {e}")
            
    print(f"[Success] Vector store updated at: {db_path}")
    print(f"          Total Index Size: {vector_store.index.ntotal}")

def cmd_query(args):
    workdir = args.workdir
    query_text = args.text
    api_url = args.api_url
    
    vector_store = init_or_load_db(workdir, api_url)
    if not vector_store:
        print("[Error] Vector store not initialized in this workdir.")
        return

    print(f"[*] Searching for: '{query_text}' (Top {args.k})")
    try:
        results = vector_store.similarity_search(query_text, k=args.k)
        for i, res in enumerate(results):
            print(f"\n--- Result {i+1} (Source: {os.path.basename(res.metadata.get('source', 'unknown'))}) ---")
            print(res.page_content.strip())
    except Exception as e:
        print(f"[Error] Query failed: {e}")

def main():
    parser = argparse.ArgumentParser(description="Novel Vector Store Manager")
    parser.add_argument("--workdir", required=True, help="Project root directory")
    parser.add_argument("--api-url", default="http://localhost:1234/v1", help="LM Studio API URL")
    
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # Add Command
    add_parser = subparsers.add_parser("add", help="Add files to vector store")
    add_parser.add_argument("files", nargs="+", help="List of file paths")
    add_parser.add_argument("--chunk-size", type=int, default=3000, help="Chunk size (chars)")
    add_parser.add_argument("--chunk-overlap", type=int, default=500, help="Overlap (chars)")
    add_parser.add_argument("--batch-size", type=int, default=10, help="Batch processing size")
    
    # Query Command
    query_parser = subparsers.add_parser("query", help="Query the vector store")
    query_parser.add_argument("text", help="Query text")
    query_parser.add_argument("-k", type=int, default=3, help="Number of results")

    args = parser.parse_args()
    
    if args.command == "add":
        cmd_add(args)
    elif args.command == "query":
        cmd_query(args)

if __name__ == "__main__":
    main()
