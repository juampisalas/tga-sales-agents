import os
import unittest
from unittest.mock import patch

os.environ.setdefault("OPENAI_API_KEY", "test-key-not-used")

from agents import AGENTS
from agents.surfe.agent import client as surfe_client
from config import MODELS
from shared.openai_client import SharedClient, client


class SharedOpenAIClientTest(unittest.TestCase):
    def test_every_agent_imports_the_same_client(self) -> None:
        modules = (
            "agents.orchestrator.agent",
            "agents.sales_navigator.agent",
            "agents.qualifier.agent",
            "agents.surfe.agent",
            "agents.hubspot.agent",
            "agents.prospecting.agent",
            "agents.reporter.agent",
        )
        for module_name in modules:
            module = __import__(module_name, fromlist=["client"])
            self.assertIs(module.client, client)
        self.assertIs(surfe_client, client)

    def test_agents_keep_their_own_model_on_the_shared_client(self) -> None:
        calls: list[dict] = []

        class FakeResponses:
            def create(self, **kwargs):
                calls.append(kwargs)

                class Response:
                    output_text = "listo"

                return Response()

        class FakeClient:
            responses = FakeResponses()

        fake = FakeClient()
        for agent_type in AGENTS:
            text = agent_type(fake).run("pedido de prueba")
            self.assertEqual(text, "listo")

        self.assertEqual([call["model"] for call in calls], [MODELS[agent_type.name] for agent_type in AGENTS])
        self.assertEqual(len({id(agent_type(client).client) for agent_type in AGENTS}), 1)
        self.assertNotEqual(MODELS["orchestrator"], MODELS["surfe"])

    def test_missing_key_does_not_open_a_connection(self) -> None:
        separate = SharedClient()
        with patch.dict(os.environ, {"OPENAI_API_KEY": "  "}, clear=False):
            with self.assertRaisesRegex(RuntimeError, "Falta OPENAI_API_KEY"):
                separate.connect()
        self.assertIsNone(separate._client)


if __name__ == "__main__":
    unittest.main()
