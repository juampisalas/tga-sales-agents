import sys

from agents import AGENTS
from shared.openai_client import client, key_is_set


def roster() -> list[str]:
    lines = [
        "cliente: shared.openai_client",
        f"openai_key={'presente' if key_is_set() else 'falta'}",
    ]
    for agent_type in AGENTS:
        agent = agent_type(client)
        lines.append(f"{agent.name}\t{agent.model}")
    return lines


def main() -> None:
    print("\n".join(roster()))
    if len(sys.argv) > 1:
        task = " ".join(sys.argv[1:])
        print(AGENTS[0](client).run(task))


if __name__ == "__main__":
    main()
