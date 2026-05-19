---
name: vector-databases
description: Vector database operations — embed, store, search, and build RAG pipelines.
platforms: [linux, macos, windows]
tags: [vector-db, embeddings, rag, semantic-search, chromadb, pgvector, mlops, llm]
---

# Vector Databases SOP

Embed documents, store vectors, run similarity search, and build RAG retrieval pipelines using ChromaDB, pgvector, and popular embedding models.

## When to Use

- User wants to build semantic search over a document corpus
- User wants to implement a RAG (Retrieval-Augmented Generation) pipeline
- User wants to store and query embeddings efficiently
- User wants to find similar items by meaning, not keyword
- User wants to choose between embedding models and vector stores

---

## Part 1 — Embedding Model Selection

| Model | Provider | Dims | Best For | Cost |
|-------|----------|------|----------|------|
| `text-embedding-3-small` | OpenAI | 1536 | General purpose, fast | ~$0.02/1M tokens |
| `text-embedding-3-large` | OpenAI | 3072 | Higher accuracy | ~$0.13/1M tokens |
| `all-MiniLM-L6-v2` | sentence-transformers | 384 | Local, fast, English | Free |
| `all-mpnet-base-v2` | sentence-transformers | 768 | Local, balanced quality | Free |
| `BAAI/bge-m3` | HuggingFace | 1024 | Multilingual, local | Free |
| `nomic-embed-text` | Ollama | 768 | Local, good quality | Free |
| `mxbai-embed-large` | Ollama | 1024 | Local, high quality | Free |

### OpenAI Embeddings

```python
import os
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

def embed_openai(texts: list[str], model="text-embedding-3-small") -> list[list[float]]:
    """Embed a batch of texts. Max 2048 inputs per call."""
    # Replace newlines — they degrade embedding quality
    texts = [t.replace("\n", " ") for t in texts]
    response = client.embeddings.create(input=texts, model=model)
    return [item.embedding for item in response.data]

# Single text
vec = embed_openai(["Hello world"])[0]
print(f"Dimension: {len(vec)}")
```

### Sentence-Transformers (local)

```python
# pip install sentence-transformers
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")

def embed_local(texts: list[str]) -> list[list[float]]:
    embeddings = model.encode(texts, batch_size=64, show_progress_bar=True, normalize_embeddings=True)
    return embeddings.tolist()

vecs = embed_local(["Semantic search is powerful", "Vector databases store embeddings"])
print(f"Shape: {len(vecs)} x {len(vecs[0])}")
```

### Ollama Embeddings (local server)

```python
import requests

def embed_ollama(texts: list[str], model="nomic-embed-text") -> list[list[float]]:
    """Requires: ollama serve && ollama pull nomic-embed-text"""
    vecs = []
    for text in texts:
        r = requests.post("http://localhost:11434/api/embeddings",
                          json={"model": model, "prompt": text})
        r.raise_for_status()
        vecs.append(r.json()["embedding"])
    return vecs
```

---

## Part 2 — Chunking Strategies

Chunking quality directly impacts retrieval quality. Poor chunks = poor answers.

```python
from typing import Generator

def chunk_fixed(text: str, chunk_size: int = 512, overlap: int = 64) -> list[str]:
    """Fixed-size character chunking with overlap."""
    chunks = []
    start  = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks

def chunk_by_paragraph(text: str, max_chars: int = 800) -> list[str]:
    """Split on double newlines, merge short paragraphs."""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks, current = [], ""
    for para in paragraphs:
        if len(current) + len(para) > max_chars and current:
            chunks.append(current.strip())
            current = para
        else:
            current = current + "\n\n" + para if current else para
    if current:
        chunks.append(current.strip())
    return chunks

def chunk_by_sentence(text: str, max_sentences: int = 5) -> list[str]:
    """Simple sentence-based chunking."""
    import re
    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks = []
    for i in range(0, len(sentences), max_sentences):
        chunks.append(" ".join(sentences[i:i + max_sentences]))
    return chunks
```

**Chunking guidance:**
- **Fixed-size with overlap:** Safe default; use for mixed content.
- **Paragraph-based:** Best for structured documents (articles, reports, documentation).
- **Sentence-based:** Best for FAQ-style or Q&A retrieval.
- For code: chunk by function/class, not arbitrary size.
- Ideal chunk size: 256–512 tokens for retrieval; 512–1024 for dense context.
- Always include document metadata (source, title, page) in chunk metadata.

---

## Part 3 — ChromaDB

ChromaDB is a lightweight, embedded vector store — no external server required for local use.

### Install and Setup

```bash
pip install chromadb
```

### Create a Collection and Add Documents

```python
import chromadb
from chromadb.utils import embedding_functions

# Embedded (local file) — persists to disk
client = chromadb.PersistentClient(path="./chroma_db")

# Use OpenAI embeddings (or swap for sentence-transformers)
ef = embedding_functions.OpenAIEmbeddingFunction(
    api_key=os.environ["OPENAI_API_KEY"],
    model_name="text-embedding-3-small",
)

collection = client.get_or_create_collection(
    name="documents",
    embedding_function=ef,
    metadata={"hnsw:space": "cosine"},   # cosine similarity
)

# Add documents
docs = [
    "ChromaDB is an open-source vector database.",
    "Semantic search finds results by meaning, not keywords.",
    "RAG combines retrieval with language model generation.",
]
metas = [
    {"source": "intro.md", "section": "overview"},
    {"source": "search.md", "section": "concepts"},
    {"source": "rag.md", "section": "architecture"},
]
ids = [f"doc_{i}" for i in range(len(docs))]

collection.add(documents=docs, metadatas=metas, ids=ids)
print(f"Collection count: {collection.count()}")
```

### Query

```python
results = collection.query(
    query_texts=["how does vector search work?"],
    n_results=3,
    include=["documents", "metadatas", "distances"],
)

for i, (doc, meta, dist) in enumerate(zip(
    results["documents"][0],
    results["metadatas"][0],
    results["distances"][0],
)):
    print(f"[{i+1}] distance={dist:.4f}  source={meta['source']}")
    print(f"     {doc[:120]}")
```

### Update and Delete

```python
# Update a document
collection.update(ids=["doc_0"], documents=["Updated content for doc_0."])

# Delete
collection.delete(ids=["doc_2"])

# Filter by metadata during query
results = collection.query(
    query_texts=["vector databases"],
    n_results=2,
    where={"source": "intro.md"},   # metadata filter
)
```

---

## Part 4 — pgvector (PostgreSQL)

pgvector stores vectors as a PostgreSQL column type — ideal for production when you already use Postgres.

### Setup

```bash
# Enable extension (run once)
psql -d mydb -c "CREATE EXTENSION IF NOT EXISTS vector;"

pip install pgvector psycopg2-binary sqlalchemy
```

### Schema and Insert

```python
import os
import psycopg2
from pgvector.psycopg2 import register_vector

conn = psycopg2.connect(os.environ["DATABASE_URL"])
register_vector(conn)
cur  = conn.cursor()

# Create table
cur.execute("""
    CREATE TABLE IF NOT EXISTS documents (
        id        BIGSERIAL PRIMARY KEY,
        content   TEXT NOT NULL,
        source    TEXT,
        embedding vector(1536)   -- match your embedding model dimension
    );
""")

# Create index for fast ANN search (IVFFlat)
cur.execute("""
    CREATE INDEX IF NOT EXISTS documents_embedding_idx
    ON documents USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);   -- lists ≈ sqrt(n_rows)
""")
conn.commit()

# Insert with embedding
def insert_document(content: str, source: str, embedding: list[float]):
    cur.execute(
        "INSERT INTO documents (content, source, embedding) VALUES (%s, %s, %s)",
        (content, source, embedding)
    )
    conn.commit()
```

### Similarity Search

```python
def search_similar(query_embedding: list[float], limit: int = 5) -> list[dict]:
    cur.execute("""
        SELECT id, content, source,
               1 - (embedding <=> %s::vector) AS similarity
        FROM documents
        ORDER BY embedding <=> %s::vector
        LIMIT %s;
    """, (query_embedding, query_embedding, limit))
    rows = cur.fetchall()
    return [{"id": r[0], "content": r[1], "source": r[2], "similarity": r[3]} for r in rows]

query_vec = embed_openai(["What is semantic search?"])[0]
results   = search_similar(query_vec, limit=3)
for r in results:
    print(f"similarity={r['similarity']:.4f}  {r['content'][:100]}")
```

---

## Part 5 — RAG Retrieval Pipeline

```python
import os
from openai import OpenAI

openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

def rag_answer(question: str, collection, n_docs: int = 4, model: str = "gpt-4o-mini") -> str:
    """
    1. Embed the question
    2. Retrieve top-n chunks from vector store
    3. Build prompt with retrieved context
    4. Generate answer with LLM
    """

    # Step 1: Retrieve
    results = collection.query(
        query_texts=[question],
        n_results=n_docs,
        include=["documents", "metadatas", "distances"],
    )
    chunks = results["documents"][0]
    metas  = results["metadatas"][0]
    dists  = results["distances"][0]

    # Filter low-relevance chunks (cosine distance > 0.4 = less than 60% similarity)
    relevant = [(c, m) for c, m, d in zip(chunks, metas, dists) if d < 0.4]
    if not relevant:
        return "I could not find relevant information to answer this question."

    context_parts = []
    for i, (chunk, meta) in enumerate(relevant):
        src = meta.get("source", "unknown")
        context_parts.append(f"[{i+1}] (source: {src})\n{chunk}")
    context = "\n\n".join(context_parts)

    # Step 2: Generate
    messages = [
        {
            "role": "system",
            "content": (
                "You are a helpful assistant. Answer questions using ONLY the provided context. "
                "If the answer is not in the context, say so. "
                "Cite the source number (e.g. [1]) for each claim."
            ),
        },
        {
            "role": "user",
            "content": f"Context:\n{context}\n\nQuestion: {question}",
        },
    ]

    response = openai_client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.2,
    )
    return response.choices[0].message.content

# Usage
answer = rag_answer("What is ChromaDB used for?", collection)
print(answer)
```

---

## Part 6 — Indexing Pipeline Template

```python
#!/usr/bin/env python3
"""index_documents.py — read files → chunk → embed → store in ChromaDB"""
import os, glob, chromadb
from chromadb.utils import embedding_functions

SOURCE_DIR = "./docs"
CHROMA_DIR = "./chroma_db"
CHUNK_SIZE = 512
CHUNK_OVERLAP = 64

ef = embedding_functions.OpenAIEmbeddingFunction(
    api_key=os.environ["OPENAI_API_KEY"],
    model_name="text-embedding-3-small",
)
client     = chromadb.PersistentClient(path=CHROMA_DIR)
collection = client.get_or_create_collection("documents", embedding_function=ef,
                                             metadata={"hnsw:space": "cosine"})

# Avoid re-indexing existing docs
existing_ids = set(collection.get()["ids"])
docs, metas, ids = [], [], []

for filepath in glob.glob(f"{SOURCE_DIR}/**/*.md", recursive=True):
    with open(filepath, encoding="utf-8") as f:
        text = f.read()
    chunks = chunk_fixed(text, CHUNK_SIZE, CHUNK_OVERLAP)
    for i, chunk in enumerate(chunks):
        doc_id = f"{filepath}::{i}"
        if doc_id in existing_ids:
            continue
        docs.append(chunk)
        metas.append({"source": filepath, "chunk": i})
        ids.append(doc_id)

# Batch insert (100 at a time to respect API limits)
BATCH = 100
for i in range(0, len(docs), BATCH):
    collection.add(documents=docs[i:i+BATCH], metadatas=metas[i:i+BATCH], ids=ids[i:i+BATCH])
    print(f"Indexed {min(i+BATCH, len(docs))} / {len(docs)}")

print(f"Done. Collection size: {collection.count()}")
```

---

## Checklist

- [ ] Embedding model chosen based on accuracy/cost/local tradeoff
- [ ] Embedding dimension matches vector store collection configuration
- [ ] Chunking strategy matches document structure (paragraph/sentence/fixed)
- [ ] Chunk metadata includes source file path and chunk index for traceability
- [ ] Already-indexed documents skipped on re-run (idempotent indexing)
- [ ] Retrieval filters out low-similarity results before passing to LLM
- [ ] pgvector: IVFFlat or HNSW index created after initial data load (not before)
- [ ] RAG prompt instructs LLM to cite sources and acknowledge missing info
