from shared.openai_client import client

from agents.base import Agent


class Prospecting(Agent):
    name = "prospecting"
    instructions = (
        "Trabajás por tu cuenta, aparte de la lista diaria de Sales Navigator. "
        "Buscás señales de empresas que necesitan capacitarse: academias internas, búsquedas de L&D, "
        "onboarding, compliance o capacitación. "
        "También marcás perfiles muy senior para TGA: dirección de capacitación, L&D, desarrollo organizacional "
        "o diseño instruccional. En Chile, además, RR. HH., HSE o compliance. "
        "No inventes empresas ni personas. Si no hay evidencia, decí que no hay señal. "
        "No inicies sesión, no mandes mensajes y no esperes a Surfe ni a HubSpot."
    )


prospecting = Prospecting(client)
