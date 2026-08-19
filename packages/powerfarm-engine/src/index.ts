import helloAgentic from "../../../examples/gadgets/hello-agentic/gadget.yaml";
import { createHttpHandler, type EngineEnv } from "./http.js";

const handler = createHttpHandler({ gadgets: { "hello-agentic": helloAgentic } });

export default {
  fetch(request: Request, env: EngineEnv): Promise<Response> {
    return handler.fetch(request, env);
  },
};
