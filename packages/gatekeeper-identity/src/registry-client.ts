import type { RegistryAuthorityClient } from "./powerfarm-authority.js";

type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class SupabaseRegistryClient implements RegistryAuthorityClient {
  readonly #baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly publishableKey: string,
    private readonly callerBearer: string,
    private readonly fetcher: FetchFunction = fetch,
  ) {
    if (!baseUrl.startsWith("https://") || publishableKey === "" || callerBearer === "") {
      throw new Error("Registry delegated authentication is not configured");
    }
    this.#baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async rpc(name: string, params: Record<string, unknown>): Promise<unknown> {
    if (!/^powerfarm_[a-z0-9_]+$/.test(name)) throw new Error("Invalid Powerfarm Registry RPC");
    const response = await this.fetcher(`${this.#baseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        apikey: this.publishableKey,
        authorization: `Bearer ${this.callerBearer}`,
      },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      throw new Error(`Powerfarm Registry RPC ${name} failed (${response.status})`);
    }
    const text = await response.text();
    if (text.length > 1_000_000) throw new Error(`Powerfarm Registry RPC ${name} response too large`);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error(`Powerfarm Registry RPC ${name} returned invalid JSON`);
    }
  }
}
