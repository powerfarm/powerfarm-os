import { WorkerEntrypoint } from "cloudflare:workers";
import type { ErrorEventV1, ErrorReporterProps } from "@gadgets/error-reporting";
export declare class ErrorReporter extends WorkerEntrypoint<unknown, ErrorReporterProps> {
    report(event: ErrorEventV1): Promise<void>;
}
declare const _default: {
    fetch(): Promise<Response>;
};
export default _default;
