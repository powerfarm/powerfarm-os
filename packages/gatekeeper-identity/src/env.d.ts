declare namespace Cloudflare {
  interface Env {
    ISSUER: string;
    CLIENT_ID?: string;
    CLIENT_SECRET?: string;
    BASE_URL?: string;
  }
  interface GlobalProps {
    mainModule: typeof import("./index.js");
    durableNamespaces: "UserAccount";
  }
}
