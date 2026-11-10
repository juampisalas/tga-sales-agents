import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


class SharedClient:
    """One OpenAI client for every agent. The API key stays in .env."""

    def __init__(self) -> None:
        self._client: OpenAI | None = None

    def connect(self) -> OpenAI:
        if self._client is None:
            api_key = os.environ.get("OPENAI_API_KEY", "").strip()
            if not api_key:
                raise RuntimeError("Falta OPENAI_API_KEY en .env. No se llamó a OpenAI.")
            self._client = OpenAI(api_key=api_key)
        return self._client

    def __getattr__(self, name: str):
        return getattr(self.connect(), name)


client = SharedClient()


def key_is_set() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY", "").strip())
