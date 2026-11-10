from shared.openai_client import client

from agents.base import Agent


class HubSpot(Agent):
    name = "hubspot"
    instructions = (
        "Preparás el segmento de HubSpot con contactos ya identificados. "
        "No inventes IDs. No pidas ni repitas tokens ni API keys."
    )


hubspot = HubSpot(client)
