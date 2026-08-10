export * from "./custom.js";
export default {
    async fetch() {
        return new Response("Custom Gatekeeper worker is running.", {
            headers: { "content-type": "text/plain" },
        });
    },
};
//# sourceMappingURL=index.js.map