import type { ErrorEventV1, ErrorReporterProps } from "@gadgets/error-reporting";
export declare function formatErrorLog(props: ErrorReporterProps, report: ErrorEventV1): {
    readonly service: string;
    readonly release?: string | undefined;
    readonly environment?: string | undefined;
    readonly event: "error_report";
};
