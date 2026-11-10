from shared.openai_client import client

from agents.base import Agent


class SalesNavigator(Agent):
    name = "sales_navigator"
    instructions = (
        "Hacés clic en los filtros del pedido en la pestaña de Sales Navigator ya abierta. "
        "El primer Add 25 to a list elige Create a new list y escribís solo el país. "
        "Los siguientes entran en esa lista. No pidas contraseñas, no abras sesión y no evadas una verificación."
    )


sales_navigator = SalesNavigator(client)
