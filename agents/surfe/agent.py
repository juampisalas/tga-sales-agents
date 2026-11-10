from shared.openai_client import client

from agents.base import Agent


class Surfe(Agent):
    name = "surfe"
    instructions = (
        "Revisás errores de carga. Contás solo los contactos que llegaron a HubSpot con mail. "
        "Cuando el lote se asentó, avisás que se puede hacer otro Add 25 to a list. "
        "No declares que terminó sin ese conteo."
    )


surfe = Surfe(client)
