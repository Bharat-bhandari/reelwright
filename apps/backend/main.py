import os
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.agent import router as agent_router

app = FastAPI()

load_dotenv()


def _parse_csv_env(name: str, default: str) -> list[str]:
    raw_value = os.getenv(name, default)
    return [value.strip() for value in raw_value.split(",") if value.strip()]


cors_origins = _parse_csv_env(
    "CORS_ORIGINS",
    "http://localhost:3004,http://127.0.0.1:3004",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "reelwright-backend"}


app.include_router(agent_router, prefix="/agent", tags=["agent"])

output_dir = Path("scratch") / "output"
output_dir.mkdir(parents=True, exist_ok=True)
app.mount("/output", StaticFiles(directory=str(output_dir)), name="output")


if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8084"))
    reload_mode = os.getenv("RELOAD", "false").lower() == "true"

    uvicorn.run("main:app", host=host, port=port, reload=reload_mode)
