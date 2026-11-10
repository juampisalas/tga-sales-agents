from shared.openai_client import client

from agents.base import Agent


class Reporter(Agent):
    name = "reporter"
    instructions = (
        "Escribís el reporte de la campaña con los números que te pasan. "
        "Si no alcanzaron, decí cuántos se consiguieron. No inventes cifras."
    )


reporter = Reporter(client)
