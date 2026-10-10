import { createTypedRpcServiceClient } from "@vibestudio/shared/typedRpcServiceClient";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import { Badge, Button, Callout, Flex, Tabs, Text } from "@radix-ui/themes";
import { credentialsMethods } from "@vibestudio/service-schemas/credentials";

import {
  buildPanelLink,
  extensions,
  rpc,
  workspace,
  openPanel,
} from "@workspace/runtime";
import { createTemplateManagementClient } from "@workspace/template-management";
import {
  TemplateAuthoring,
  TemplateUpdates,
  TemplateContributions,
} from "@workspace/react/templates";
import { useAsyncResource } from "@workspace/about-shared/asyncState";
import { AboutPage, AboutThemeRoot } from "@workspace/about-shared/ui";

const templates = createTemplateManagementClient((extension, method, args) =>
  extensions.invoke(extension, method, args),
);
const accounts = createTypedRpcServiceClient(rpc, { targetId: "main", namespace: "credentials" }, credentialsMethods);
const listSourceAccounts = () => accounts.listStoredCredentials();
const readInfo = () => workspace.getInfo();
const readSources = () => templates.installed();
export default function WorkspacePage() {
  const infoResource = useAsyncResource(readInfo);
  const sourcesResource = useAsyncResource(readSources);
  const info = infoResource.data ?? null;
  const error = infoResource.error;
  const sources = sourcesResource.data ?? null;
  const sourceError = sourcesResource.error;
  const refresh = sourcesResource.refresh;
  const upstream = sources?.find(
    (source) => source.relationship === "upstream",
  );
  return (
    <AboutThemeRoot>
      <AboutPage
        title={info?.name ?? "This workspace"}
        subtitle="Manage this workspace"
        maxWidth={1040}
        actions={
          <Button variant="soft" asChild>
            <a href={buildPanelLink("about/templates")}>Explore workspaces</a>
          </Button>
        }
      >
        {error && (
          <Callout.Root color="red">
            <Callout.Text>{error}</Callout.Text>
            <Button onClick={() => void infoResource.refresh()}>Try again</Button>
          </Callout.Root>
        )}
        {!info && !error && (
          <Text role="status">Reading this workspace’s sources…</Text>
        )}
        {info && (
          <>
            <Flex gap="2" wrap="wrap" mb="5">
              <Badge size="2">
                {upstream
                  ? "Template authoring"
                  : sources
                    ? "Workspace using templates"
                    : "This workspace"}
              </Badge>
              <Text size="2" color="gray">
                {upstream
                  ? `Authoring ${upstream.presentation?.name ?? upstream.pin.url}`
                  : sources
                    ? "Your changes stay in this workspace; templates supply its dependencies."
                    : ""}
              </Text>
            </Flex>
            <Tabs.Root defaultValue="updates">
              <Tabs.List mb="4">
                <Tabs.Trigger value="updates">Updates</Tabs.Trigger>
                <Tabs.Trigger value="publish">Publish</Tabs.Trigger>
              </Tabs.List>
              <Tabs.Content value="updates">
                {sourceError && (
                  <Callout.Root color="red">
                    <Callout.Text>{sourceError}</Callout.Text>
                    <Button onClick={() => void refresh()}>
                      Try again
                    </Button>
                  </Callout.Root>
                )}
                {!sources && !sourceError && (
                  <Text role="status">Reading recorded sources…</Text>
                )}
                {sources && (
                  <TemplateUpdates
                    key={info.id}
                    client={templates}
                    workspaceId={info.id}
                    sources={sources}
                    onRefresh={refresh}
                    onReviewWithAgent={(initialPrompt) =>
                      window.location.assign(
                        buildPanelLink("panels/chat", {
                          stateArgs: {
                            seed: { openingRequest: initialPrompt },
                          },
                        }),
                      )
                    }
                  />
                )}
              </Tabs.Content>
              <Tabs.Content value="publish">
                <Text as="p" color="gray">
                  Send a release from this workspace to a repository. To bring
                  changes in, use Updates.
                </Text>
                <TemplateAuthoring
                  key={info.id}
                  client={templates}
                  workspaceId={info.id}
                  listAccounts={listSourceAccounts}
                  onPublished={refresh}
                  onConnectGitHub={async () => {
                    await openPanel("panels/chat", {
                      stateArgs: {
                        seed: {
                          openingRequest:
                          "Help me connect or repair my GitHub account for publishing this workspace. Use the GitHub setup skill. For an existing repository I need contents write access; ask whether I need to create a new repository before requesting administration access. Do not publish anything.",
                        },
                      },
                    });
                  }}
                  fetchContent={async (hash) => {
                    const value = await rpc.call(
                      "main",
                      mainRpcMethods["blobstore.getBase64"],
                      [hash],
                    );
                    if (value === null)
                      throw new Error(
                        "Review content is no longer available. Review the release again.",
                      );
                    return Uint8Array.from(atob(value), (character) =>
                      character.charCodeAt(0),
                    );
                  }}
                />
                {sources?.some(
                  (source) => source.relationship !== "upstream",
                ) && (
                  <details style={{ marginTop: 32 }}>
                    <summary style={{ minHeight: 44, cursor: "pointer" }}>
                      Contribute changes to a dependency instead
                    </summary>
                    <TemplateContributions
                      key={info.id}
                      client={templates}
                      workspaceId={info.id}
                      sources={sources}
                    />
                  </details>
                )}
              </Tabs.Content>
            </Tabs.Root>
          </>
        )}
      </AboutPage>
    </AboutThemeRoot>
  );
}
