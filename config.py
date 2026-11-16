import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

# One key, one bill. Prospecting picks its model below.
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
HUBSPOT_ACCESS_TOKEN = os.environ.get("HUBSPOT_ACCESS_TOKEN", "")

MODELS = {
    "prospecting": "gpt-4.1",
}
