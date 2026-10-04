# @workspace/harness

Product tools, prompt resources, channel boundary types and portable domain
algorithms shared by Vibestudio agents. Native execution is owned by
`AgentVesselBase` and `AgentWorkerBase` in `@workspace/agentic-do`, using the
published `@panticonic/pi-*` packages.

The durable owner admits each channel input, model request and tool invocation.
Tools are native `ToolRegistration` definitions. Their execution receives the
original invocation API and Context; product tools bind host RPC authority and
resource identity through the vessel's native tool binding before making effects.
Recovery resumes that original operation. Cancellation joins its resources before
settlement, and original failures propagate to the waiting caller.

Channel preparation owns required prompt, membership and product UI setup.
Activation follows committed readiness. History forks export knowledge and user
configuration into a fresh execution owner; they do not copy running work.

Public subpaths expose standard tools, Eval, web extraction, image generation,
merge review, semantic file resolution, prompt composition and channel types.
`testing/native-tool` exercises product tools through actual native tool tasks.
Agent tests use `@workspace/agentic-do/testing/native-vessel` to obtain the actual
schema descriptor and enter the ordinary product initializer. Tests must release
owned native work and close their database in a finally-equivalent cleanup path.
