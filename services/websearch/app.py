"""Internal-only metasearch endpoint. It is never published outside Docker."""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from ddgs import DDGS

app = FastAPI(docs_url=None, redoc_url=None)


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=300)
    limit: int = Field(default=5, ge=1, le=8)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/search")
def search(request: SearchRequest):
    try:
        rows = list(DDGS().text(request.query, max_results=request.limit, backend="auto"))
    except Exception as error:
        raise HTTPException(status_code=503, detail="metasearch unavailable") from error
    return {
        "query": request.query,
        "results": [
            {
                "title": str(row.get("title", ""))[:300],
                "url": str(row.get("href", row.get("url", "")))[:2048],
                "snippet": str(row.get("body", row.get("snippet", "")))[:1200],
            }
            for row in rows
            if isinstance(row, dict) and row.get("href", row.get("url"))
        ],
    }
