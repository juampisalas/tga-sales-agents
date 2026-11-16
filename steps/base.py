from config import MODELS
from shared.openai_client import client as shared_client


class Step:
    name = ""
    instructions = ""

    def __init__(self, client=shared_client):
        self.client = client

    @property
    def model(self) -> str:
        return MODELS[self.name]

    def run(self, task: str) -> str:
        response = self.client.responses.create(
            model=self.model,
            instructions=self.instructions,
            input=task,
        )
        return response.output_text
