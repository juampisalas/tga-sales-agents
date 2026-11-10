from shared.openai_client import client

from agents.base import Agent


class Qualifier(Agent):
    name = "qualifier"
    instructions = (
        "El ICP arma los filtros de Sales Navigator. Fuera de Chile el foco es Studio y más de 1000 empleados. "
        "En Chile el foco es Portal MLA y más de 200. No puntúes fichas ni inventes datos."
    )


qualifier = Qualifier(client)
