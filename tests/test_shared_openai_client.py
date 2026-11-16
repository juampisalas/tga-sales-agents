import os
import unittest
from unittest.mock import patch

os.environ.setdefault("OPENAI_API_KEY", "test-key-not-used")

from steps import STEPS
from steps.prospecting.step import client as prospecting_client
from config import MODELS
from shared.openai_client import SharedClient, client


class SharedOpenAIClientTest(unittest.TestCase):
    def test_prospecting_imports_the_shared_client(self) -> None:
        self.assertIs(prospecting_client, client)
        self.assertEqual(STEPS, (STEPS[0],))
        self.assertEqual(STEPS[0].name, "prospecting")

    def test_prospecting_uses_its_model_on_the_shared_client(self) -> None:
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
        text = STEPS[0](fake).run("pedido de prueba")
        self.assertEqual(text, "listo")
        self.assertEqual(calls[0]["model"], MODELS["prospecting"])
        self.assertIs(STEPS[0](client).client, client)

    def test_missing_key_does_not_open_a_connection(self) -> None:
        separate = SharedClient()
        with patch.dict(os.environ, {"OPENAI_API_KEY": "  "}, clear=False):
            with self.assertRaisesRegex(RuntimeError, "Falta OPENAI_API_KEY"):
                separate.connect()
        self.assertIsNone(separate._client)


if __name__ == "__main__":
    unittest.main()
