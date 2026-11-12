from agents.prospecting.agent import prospecting


def main() -> None:
    print(prospecting.run(
        "Arrancá ahora, por tu cuenta. "
        "Buscá señales de empresas que necesitan capacitarse y perfiles muy senior para TGA. "
        "Solo podés nombrar una empresa o una persona si está en la evidencia que te pasaron. "
        "Esta vez no hay evidencia. Decilo y no inventes nombres."
    ))


if __name__ == "__main__":
    main()
