export function formatErrorLog(props, report) {
    const event = { ...report };
    delete event.event;
    delete event.service;
    delete event.environment;
    delete event.release;
    return { ...event, event: "error_report", ...props };
}
//# sourceMappingURL=format.js.map