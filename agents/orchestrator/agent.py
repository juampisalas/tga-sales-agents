from shared.openai_client import client

from agents.base import Agent


class Orchestrator(Agent):
    name = "orchestrator"
    instructions = (
        "Sos el orquestador de TGA. Coordinás a los otros agentes y no hacés el trabajo de cada uno. "
        "No inventes contactos, empresas ni resultados. Si falta evidencia, decilo."
    )


orchestrator = Orchestrator(client)
