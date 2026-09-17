import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Callout, Flex, Tabs, Text } from "@radix-ui/themes";
import { credentialsMethods } from "@vibestudio/service-schemas/credentials";
import { createTypedServiceClient } from "@vibestudio/shared/typedServiceClient";
import { buildPanelLink, extensions, rpc, workspace } from "@workspace/runtime";
import { createTemplateManagementClient } from "@workspace/template-management";
import {
  TemplateAuthoring,
  TemplateUpdates,
  TemplateContributions,
} from "@workspace/react/templates";
import { AboutPage, AboutThemeRoot } from "@workspace/about-shared/ui";

const templates = createTemplateManagementClient((extension, method, args) =>
  extensions.invoke(extension, method, args),
);
const accounts = createTypedServiceClient(
  "credentials",
  credentialsMethods,
  (service, method, args) => rpc.call("main", `${service}.${method}`, args),
);
const listSourceAccounts = () => accounts.listStoredCredentials();
export default function WorkspacePage() {
  const [info, setInfo] = useState<Awaited<
    ReturnType<typeof workspace.getInfo>
  > | null>(null);
  const [sources, setSources] = useState<Awaited<
    ReturnType<typeof templates.installed>
  > | null>(null);
  const [error, setError] = useState("");
  const [sourceError, setSourceError] = useState("");
  const refresh = useCallback(async () => {
    setSourceError("");
    try {
      setSources(await templates.installed());
    } catch (error) {
      setSourceError(String(error));
    }
  }, []);
  useEffect(() => {
    let active = true;
    void workspace
      .getInfo()
      .then((info) => {
        if (active) setInfo(info);
      })
      .catch((error) => {
        if (active) setError(String(error));
      });
    void templates
      .installed()
      .then((sources) => {
        if (active) setSources(sources);
      })
      .catch((error) => {
        if (active) setSourceError(String(error));
      });
    return () => {
      active = false;
    };
  }, []);
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
                      Try loading sources again
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
                          stateArgs: { initialPrompt },
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
