import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

# One key, one bill. Each agent picks its own model below.
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
HUBSPOT_ACCESS_TOKEN = os.environ.get("HUBSPOT_ACCESS_TOKEN", "")

MODELS = {
    "orchestrator": "gpt-4.1",
    "sales_navigator": "gpt-4.1-mini",
    "qualifier": "gpt-4.1",
    "surfe": "gpt-4.1-mini",
    "hubspot": "gpt-4.1-mini",
    "reporter": "gpt-4.1-mini",
}
