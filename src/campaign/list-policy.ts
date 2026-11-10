export type ListStep = {
  control: "Add 25 to a list";
  list: "create" | "append";
  country: string;
  typedName: string;
};

/** Surfe escribe la fecha. El agente solo escribe el país al crear la lista. */
export function nextListStep(input: { country: string; openListCountry: string | null }): ListStep {
  const create = input.openListCountry !== input.country || input.openListCountry === null;
  return {
    control: "Add 25 to a list",
    list: create ? "create" : "append",
    country: input.country,
    typedName: create ? input.country : "",
  };
}
