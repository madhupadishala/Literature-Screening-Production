# Knowledge AI System

This area defines the machine-processing standards for the Knowledge Centre.

The target stack is:

1. source acquisition and hashing;
2. OCR/IDP where required;
3. structure-preserving parsing;
4. semantic + rule-aware chunking;
5. parent-child chunk graph;
6. dense embeddings;
7. sparse/BM25 index;
8. PostgreSQL/pgvector vector storage;
9. hybrid retrieval;
10. reranking;
11. exact mandatory-rule resolution;
12. Agentic RAG for iterative evidence investigation;
13. Decision Knowledge Pack assembly;
14. audit and provenance persistence.

The authoritative source is never the embedding or the chunk. All generated artifacts retain a reversible link to the source.
