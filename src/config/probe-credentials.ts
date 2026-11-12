export type ServiceLink = { saved: boolean; connected: boolean };
export type CredentialLinks = { openai: ServiceLink; hubspot: ServiceLink };

/** Asks OpenAI and HubSpot if the saved keys work. The result never includes the secret. */
export async function probeCredentials(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<CredentialLinks> {
  const [openai, hubspot] = await Promise.all([
    probe("https://api.openai.com/v1/models", env.OPENAI_API_KEY, fetchImpl),
    probe("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", env.HUBSPOT_ACCESS_TOKEN, fetchImpl),
  ]);
  return { openai, hubspot };
}

async function probe(url: string, token: string | undefined, fetchImpl: typeof fetch): Promise<ServiceLink> {
  const value = token?.trim() ?? "";
  if (value === "") {
    return { saved: false, connected: false };
  }
  try {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${value}` },
      signal: AbortSignal.timeout(8000),
    });
    return { saved: true, connected: response.ok };
  } catch {
    return { saved: true, connected: false };
  }
}
