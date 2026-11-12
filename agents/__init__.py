from agents.hubspot.agent import HubSpot
from agents.orchestrator.agent import Orchestrator
from agents.prospecting.agent import Prospecting
from agents.qualifier.agent import Qualifier
from agents.reporter.agent import Reporter
from agents.sales_navigator.agent import SalesNavigator
from agents.surfe.agent import Surfe

AGENTS = (Orchestrator, SalesNavigator, Qualifier, Surfe, HubSpot, Prospecting, Reporter)

__all__ = [
    "AGENTS",
    "HubSpot",
    "Orchestrator",
    "Prospecting",
    "Qualifier",
    "Reporter",
    "SalesNavigator",
    "Surfe",
]
