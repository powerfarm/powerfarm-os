var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
import { DurableObject, RpcTarget, WorkerEntrypoint, } from "cloudflare:workers";
import { skipRpcValidation, validateRpc } from "capnweb-validate";
import TYPES_CODE from "./types-code.js";
const CUSTOM_ICON = {
    url: "data:image/svg+xml," +
        encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='none' stroke='currentColor' stroke-width='20'><path d='M52 72h152v112H52z'/><path d='m52 88 76 52 76-52'/></svg>"),
};
export function describeCustomVendor() {
    return {
        displayName: "Custom Gatekeeper",
        url: "https://github.com/cloudflare/cloudflare-os-starter",
        logo: CUSTOM_ICON,
        color: "#e8f2ff",
        tagline: "Example organization-specific capability",
        description: "A minimal Gatekeeper to copy when connecting CloudflareOS to your organization's systems.",
        autoProvisionsAccount: true,
        providesAuth: false,
    };
}
export function describeCustomAccount() {
    return {
        displayName: "Custom Gatekeeper",
        avatar: CUSTOM_ICON,
        singleton: { tsType: "CustomSession" },
    };
}
let CustomSessionImpl = (() => {
    let _classDecorators = [validateRpc()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = RpcTarget;
    var CustomSessionImpl = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            CustomSessionImpl = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        #approvalQueue;
        #info;
        constructor(approvalQueue, info) {
            super();
            this.#approvalQueue = approvalQueue;
            this.#info = info;
        }
        async getDeploymentInfo() {
            await this.#approvalQueue.authorizeObservation({
                title: "Read deployment information",
                description: "Read the custom information configured by this deployment.",
            });
            return this.#info;
        }
        [Symbol.dispose]() {
            this.#approvalQueue[Symbol.dispose]?.();
        }
    };
    return CustomSessionImpl = _classThis;
})();
export { CustomSessionImpl };
let CustomGatekeeper = (() => {
    let _classDecorators = [validateRpc()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = DurableObject;
    var CustomGatekeeper = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            CustomGatekeeper = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        async describe() {
            return {
                url: "custom://deployment-info",
                title: "Deployment information",
                snippet: "Organization-specific information supplied by this deployment.",
                suggestedBindingName: "CUSTOM",
                tsType: "CustomSession",
            };
        }
        async getTypeScriptTypes() {
            return TYPES_CODE;
        }
        async getAutoApprovableActions() {
            return [];
        }
        async startSession(approvalQueue) {
            return new CustomSessionImpl(approvalQueue.dup(), {
                name: this.env.CUSTOM_NAME,
                message: this.env.CUSTOM_MESSAGE,
            });
        }
        async addObserver(_id, _user) { }
        async removeObserver(_id) { }
        async applyAction(action) {
            throw new Error(`Custom Gatekeeper has no actions (${action}).`);
        }
        async rejectAction(_action) { }
        async revertAction(_action) {
            throw new Error("Custom Gatekeeper has no actions to revert.");
        }
    };
    return CustomGatekeeper = _classThis;
})();
export { CustomGatekeeper };
let CustomAccount = (() => {
    let _classDecorators = [validateRpc()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = WorkerEntrypoint;
    let _instanceExtraInitializers = [];
    let _getVerifier_decorators;
    var CustomAccount = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _getVerifier_decorators = [skipRpcValidation()];
            __esDecorate(this, null, _getVerifier_decorators, { kind: "method", name: "getVerifier", static: false, private: false, access: { has: obj => "getVerifier" in obj, get: obj => obj.getVerifier }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            CustomAccount = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        async describe() {
            return describeCustomAccount();
        }
        async getSingletonGatekeeperClass() {
            return this.ctx.exports.CustomGatekeeper({});
        }
        async getSupportedResources() {
            return [];
        }
        getGatekeeperClassFor(_url) {
            throw new Error("Custom Gatekeeper has no URL-addressed resources.");
        }
        startResourceConfigurator(_resourceUrlPattern) {
            throw new Error("Custom Gatekeeper has no URL-addressed resources.");
        }
        async ensureResources(_resourceUrlPatterns) {
            return {};
        }
        async revoke() { }
        reconnect() {
            throw new Error("Custom Gatekeeper has no credentials to reconnect.");
        }
        async getAuthenticatedEmail() {
            return null;
        }
        async getVerifier() {
            return this.ctx.exports.CustomVerifier({});
        }
        constructor() {
            super(...arguments);
            __runInitializers(this, _instanceExtraInitializers);
        }
    };
    return CustomAccount = _classThis;
})();
export { CustomAccount };
let CustomVerifier = (() => {
    let _classDecorators = [validateRpc()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = WorkerEntrypoint;
    var CustomVerifier = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            CustomVerifier = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        verify() { }
    };
    return CustomVerifier = _classThis;
})();
export { CustomVerifier };
let GatekeeperVendor = (() => {
    let _classDecorators = [validateRpc()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = WorkerEntrypoint;
    let _instanceExtraInitializers = [];
    let _createAccount_decorators;
    var GatekeeperVendor = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _createAccount_decorators = [skipRpcValidation()];
            __esDecorate(this, null, _createAccount_decorators, { kind: "method", name: "createAccount", static: false, private: false, access: { has: obj => "createAccount" in obj, get: obj => obj.createAccount }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            GatekeeperVendor = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        async describe() {
            return describeCustomVendor();
        }
        async createAccount() {
            return this.ctx.exports.CustomAccount({});
        }
        connectAccount(_callback, _options) {
            throw new Error("Custom Gatekeeper is auto-provisioned and has no connect flow.");
        }
        async getSupportedResources(_options) {
            return [];
        }
        async getTypeScriptTypes() {
            return TYPES_CODE;
        }
        constructor() {
            super(...arguments);
            __runInitializers(this, _instanceExtraInitializers);
        }
    };
    return GatekeeperVendor = _classThis;
})();
export { GatekeeperVendor };
//# sourceMappingURL=custom.js.map