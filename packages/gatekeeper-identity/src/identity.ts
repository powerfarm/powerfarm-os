import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { validateRpc } from "capnweb-validate";
import type {
  AccountDescription,
  ResourceConfiguratorFrame,
  Gatekeeper,
  GatekeeperConnectCallback,
  GatekeeperConnectOptions,
  GatekeeperUser,
  GatekeeperUserVerifier,
  GatekeeperVendor as GatekeeperVendorIface,
  SupportedResource,
  VendorDescription,
} from "@gadgets/workshop-shared/gatekeeper";
import TYPES_CODE from "./types-code.js";

// Este gatekeeper existe para UMA coisa: provar quem e a pessoa, contra o
// emissor OAuth 2.1 da PowerFarm no Supabase. Nao da acesso a recurso nenhum.
//
// Porque o email e o que importa aqui: o Workshop indexa contas por email, e o
// proprio upstream avisa que um email nao verificado permitiria tomada de conta.
// Por isso so devolvemos email quando o emissor diz email_verified.

const ICON = {
  url: "data:image/svg+xml," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='none' " +
    "stroke='currentColor' stroke-width='18'><circle cx='128' cy='96' r='44'/>" +
    "<path d='M40 216c0-44 40-72 88-72s88 28 88 72'/></svg>"),
};

const NONCE_BYTES = 16;
const SCOPES_AUTH = "openid email";
const SCOPES_FULL = "openid email profile";

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function generateNonce(): string {
  return hex(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)));
}
function base64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
async function pkceChallenge(verifier: string): Promise<string> {
  return base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
}

/** Sem BASE_URL o redirect_uri apontaria para localhost e o emissor recusaria. */
function getBaseUrl(env: Cloudflare.Env): string {
  return (env.BASE_URL ?? "http://localhost:8787/gatekeeper/identity").replace(/\/+$/, "");
}
export function getBasePath(env: Cloudflare.Env): string {
  return new URL(getBaseUrl(env)).pathname.replace(/\/+$/, "");
}

export function describeVendor(): VendorDescription {
  return {
    displayName: "PowerFarm Identity",
    url: "https://powerfarm-registry.vercel.app",
    logo: ICON,
    color: "#e8eeff",
    tagline: "Entrar com a identidade da PowerFarm",
    description:
      "Autenticacao contra o emissor OAuth 2.1 da PowerFarm. O cargo e duravel e " +
      "assina; o modelo que o ocupa e detalhe de execucao.",
    providesAuth: true,
  };
}

type Estado = {
  initiationNonce?: string;
  oauthNonce?: string;
  pkceVerifier?: string;
  scopes?: string;
  authOnly?: boolean;
  accessToken?: string;
  refreshToken?: string;
  email?: string;
};

export class UserAccount extends DurableObject<Cloudflare.Env> {
  #ler(): Estado {
    return (this.ctx.storage.get("estado") as unknown as Estado) ?? {};
  }

  async setCallback(callback: Fetcher<GatekeeperConnectCallback>,
                    initiationNonce: string, scopes: string, authOnly: boolean): Promise<void> {
    await this.ctx.storage.put("callback", callback);
    await this.ctx.storage.put("estado", { initiationNonce, scopes, authOnly } satisfies Estado);
  }

  /**
   * O link so serve uma vez. Consumir o nonce aqui e o que impede replay: um
   * link reenviado nao reabre o fluxo.
   */
  async beginOAuthFlow(initiationNonce: string): Promise<{ oauthNonce: string;
      challenge: string; scopes: string } | null> {
    const e = await this.ctx.storage.get<Estado>("estado");
    if (!e?.initiationNonce || e.initiationNonce !== initiationNonce) return null;

    const oauthNonce = generateNonce();
    const pkceVerifier = generateNonce() + generateNonce();
    const challenge = await pkceChallenge(pkceVerifier);

    await this.ctx.storage.put("estado", {
      ...e, initiationNonce: undefined, oauthNonce, pkceVerifier,
    } satisfies Estado);
    return { oauthNonce, challenge, scopes: e.scopes ?? SCOPES_AUTH };
  }

  async acceptAuthCode(code: string, oauthNonce: string): Promise<boolean> {
    const e = await this.ctx.storage.get<Estado>("estado");
    if (!e?.oauthNonce || e.oauthNonce !== oauthNonce || !e.pkceVerifier) return false;

    const corpo = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${getBaseUrl(this.env)}/oauth`,
      client_id: this.env.CLIENT_ID ?? "",
      code_verifier: e.pkceVerifier,
    });
    const cabecalhos: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
    };
    if (this.env.CLIENT_SECRET) {
      cabecalhos.authorization = "Basic " +
        btoa(`${this.env.CLIENT_ID}:${this.env.CLIENT_SECRET}`);
    }

    const res = await fetch(`${this.env.ISSUER}/oauth/token`, {
      method: "POST", headers: cabecalhos, body: corpo,
    });
    if (!res.ok) return false;
    const tok = await res.json<{ access_token?: string; refresh_token?: string }>();
    if (!tok.access_token) return false;

    const email = await this.#emailVerificado(tok.access_token);

    await this.ctx.storage.put("estado", {
      ...e, oauthNonce: undefined, pkceVerifier: undefined,
      accessToken: tok.access_token, refreshToken: tok.refresh_token, email: email ?? undefined,
    } satisfies Estado);

    const callback = await this.ctx.storage.get<Fetcher<GatekeeperConnectCallback>>("callback");
    if (callback) await callback.complete(this.ctx.exports.GatekeeperUserImpl({
      props: { userObjectId: this.ctx.id.toString() },
    }));
    return true;
  }

  /**
   * O emissor e quem diz se o email esta verificado. Nao inferimos, nao
   * confiamos no que o utilizador escreveu: sem email_verified, devolve null.
   */
  async #emailVerificado(accessToken: string): Promise<string | null> {
    const res = await fetch(`${this.env.ISSUER}/oauth/userinfo`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const info = await res.json<{ email?: string; email_verified?: boolean }>();
    if (!info.email || info.email_verified !== true) return null;
    return info.email;
  }

  async getEmail(): Promise<string | null> {
    return (await this.ctx.storage.get<Estado>("estado"))?.email ?? null;
  }

  async revoke(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  async restart(initiationNonce: string): Promise<void> {
    const e = await this.ctx.storage.get<Estado>("estado");
    await this.ctx.storage.put("estado", { ...e, initiationNonce } satisfies Estado);
  }
}

@validateRpc()
export class GatekeeperVendor extends WorkerEntrypoint<Cloudflare.Env>
    implements GatekeeperVendorIface {
  async describe(): Promise<VendorDescription> { return describeVendor(); }

  async connectAccount(callback: Fetcher<GatekeeperConnectCallback>,
                       options?: GatekeeperConnectOptions): Promise<{ url: string }> {
    const id = this.ctx.exports.UserAccount.newUniqueId();
    const initiationNonce = generateNonce();
    const authOnly = options?.scopes === "auth";
    await this.ctx.exports.UserAccount.get(id)
      .setCallback(callback, initiationNonce, authOnly ? SCOPES_AUTH : SCOPES_FULL, authOnly);
    return { url: `${getBaseUrl(this.env)}/${id.toString()}/${initiationNonce}` };
  }

  async newUser(): Promise<Fetcher<GatekeeperUser>> {
    const id = this.ctx.exports.UserAccount.newUniqueId();
    return this.ctx.exports.GatekeeperUserImpl({ props: { userObjectId: id.toString() } });
  }

  async getSupportedResources(): Promise<SupportedResource[]> { return []; }
  async getTypeScriptTypes(): Promise<string> { return TYPES_CODE; }
}

@validateRpc()
export class GatekeeperUserImpl
    extends WorkerEntrypoint<Cloudflare.Env, { userObjectId: string }>
    implements GatekeeperUser {
  #conta() {
    const id = this.ctx.exports.UserAccount.idFromString(this.ctx.props.userObjectId);
    return this.ctx.exports.UserAccount.get(id);
  }

  async describe(): Promise<AccountDescription> {
    const email = await this.#conta().getEmail();
    return { displayName: email ?? "PowerFarm Identity", avatar: ICON };
  }

  // Contrato: nunca lanca. Qualquer falha e "nao ha email".
  async getAuthenticatedEmail(): Promise<string | null> {
    try { return await this.#conta().getEmail(); } catch { return null; }
  }

  async getVerifier(): Promise<Fetcher<GatekeeperUserVerifier>> {
    return this.ctx.exports.IdentityVerifier({
      props: { userObjectId: this.ctx.props.userObjectId },
    });
  }

  async reconnect(): Promise<{ url: string }> {
    const initiationNonce = generateNonce();
    await this.#conta().restart(initiationNonce);
    return {
      url: `${getBaseUrl(this.env)}/${this.ctx.props.userObjectId}/${initiationNonce}`,
    };
  }

  async revoke(): Promise<void> { await this.#conta().revoke(); }

  async getSupportedResources(): Promise<SupportedResource[]> { return []; }

  async getGatekeeperClassFor(url: string): Promise<{
    class: DurableObjectClass<Gatekeeper<any>>; resource: SupportedResource;
  }> {
    throw new Error(`PowerFarm Identity nao da acesso a recursos (${url}).`);
  }

  // Sem recursos endereçaveis, nao ha formulario de configuracao para servir.
  startResourceConfigurator(_resourceUrlPattern: string): Promise<ResourceConfiguratorFrame> {
    throw new Error("PowerFarm Identity nao tem recursos endereçaveis por URL.");
  }

  async ensureResources(_resourceUrlPatterns: string[]): Promise<{ url?: string }> {
    return {};
  }
}

@validateRpc()
export class IdentityVerifier
    extends WorkerEntrypoint<Cloudflare.Env, { userObjectId: string }>
    implements GatekeeperUserVerifier {}
