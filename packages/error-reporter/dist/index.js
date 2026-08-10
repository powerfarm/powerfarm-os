import { WorkerEntrypoint } from "cloudflare:workers";
import { formatErrorLog } from "./format.js";
export class ErrorReporter extends WorkerEntrypoint {
    async report(event) {
        console.error(formatErrorLog(this.ctx.props, event));
    }
}
// Keep ES Module worker format; this worker is used over RPC, not HTTP. An empty default export
// deploys as a script with no registered event handlers and the API rejects it.
export default {
    async fetch() {
        return new Response("Error Reporter worker is running.", {
            headers: { "content-type": "text/plain" },
        });
    },
};
//# sourceMappingURL=index.js.map