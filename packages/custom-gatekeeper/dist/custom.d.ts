import { DurableObject, RpcStub, RpcTarget, WorkerEntrypoint } from "cloudflare:workers";
import type { AccountDescription, ApprovalQueue, Gatekeeper, GatekeeperConnectCallback, GatekeeperConnectOptions, GatekeeperUser, GatekeeperUserVerifier, ResourceConfiguratorFrame, ResourceDescription, SupportedResource, VendorDescription } from "@gadgets/workshop-shared/gatekeeper";
import type { CustomDeploymentInfo, CustomSession } from "./types.js";
type ObservationQueue = Pick<ApprovalQueue, "authorizeObservation"> & Partial<{
    [Symbol.dispose](): void;
}>;
export declare function describeCustomVendor(): VendorDescription;
export declare function describeCustomAccount(): AccountDescription;
export declare class CustomSessionImpl extends RpcTarget implements CustomSession {
    #private;
    constructor(approvalQueue: ObservationQueue, info: CustomDeploymentInfo);
    getDeploymentInfo(): Promise<CustomDeploymentInfo>;
    [Symbol.dispose](): void;
}
export declare class CustomGatekeeper extends DurableObject<Cloudflare.Env> implements Gatekeeper<CustomSession> {
    describe(): Promise<ResourceDescription>;
    getTypeScriptTypes(): Promise<string>;
    getAutoApprovableActions(): Promise<[]>;
    startSession(approvalQueue: RpcStub<ApprovalQueue>): Promise<CustomSession>;
    addObserver(_id: string, _user: Fetcher<GatekeeperUserVerifier>): Promise<void>;
    removeObserver(_id: string): Promise<void>;
    applyAction(action: number): Promise<void>;
    rejectAction(_action: number): Promise<void>;
    revertAction(_action: number): Promise<void>;
}
export declare class CustomAccount extends WorkerEntrypoint<Cloudflare.Env> implements GatekeeperUser {
    describe(): Promise<AccountDescription>;
    getSingletonGatekeeperClass(): Promise<DurableObjectClass<Gatekeeper<CustomSession>>>;
    getSupportedResources(): Promise<SupportedResource[]>;
    getGatekeeperClassFor(_url: string): never;
    startResourceConfigurator(_resourceUrlPattern: string): Promise<ResourceConfiguratorFrame>;
    ensureResources(_resourceUrlPatterns: string[]): Promise<{
        url?: string;
    }>;
    revoke(): Promise<void>;
    reconnect(): Promise<{
        url: string;
    }>;
    getAuthenticatedEmail(): Promise<string | null>;
    getVerifier(): Promise<Fetcher<GatekeeperUserVerifier>>;
}
export declare class CustomVerifier extends WorkerEntrypoint<Cloudflare.Env> implements GatekeeperUserVerifier {
    verify(): void;
}
export declare class GatekeeperVendor extends WorkerEntrypoint<Cloudflare.Env> {
    describe(): Promise<VendorDescription>;
    createAccount(): Promise<Fetcher<GatekeeperUser>>;
    connectAccount(_callback: Fetcher<GatekeeperConnectCallback>, _options?: GatekeeperConnectOptions): Promise<{
        url: string;
    }>;
    getSupportedResources(_options?: {
        userId?: string;
    }): Promise<SupportedResource[]>;
    getTypeScriptTypes(): Promise<string>;
}
export {};
