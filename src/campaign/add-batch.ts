export type ListControls = {
  click(name: string): Promise<void>;
  fillCountry(country: string): Promise<void>;
};

/** Surfe pone la fecha. Acá solo se escribe el país al crear la lista. */
export async function addTwentyFive(input: {
  country: string;
  listOpen: boolean;
  controls: ListControls;
}): Promise<{ listOpen: true }> {
  await input.controls.click("Add 25 to a list");
  if (!input.listOpen) {
    await input.controls.click("Create a new list");
    await input.controls.fillCountry(input.country);
  } else {
    await input.controls.click(input.country);
  }
  return { listOpen: true };
}
