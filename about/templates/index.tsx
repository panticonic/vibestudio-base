import { useEffect, useState } from "react";
import { Tabs } from "@radix-ui/themes";
import { credentialsMethods } from "@vibestudio/service-schemas/credentials";
import { createTypedServiceClient } from "@vibestudio/shared/typedServiceClient";
import { extensions, rpc, workspace } from "@workspace/runtime";
import { createShellSurfaceLink } from "@vibestudio/shared/shellSurface";
import { createTemplateManagementClient } from "@workspace/template-management";
import {
  TemplateBrowser,
  TemplateAuthoring,
  TemplateInstalled,
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
export default function TemplatesPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  useEffect(() => {
    void workspace.getInfo().then((info) => setWorkspaceId(info.id));
  }, []);
  return (
    <AboutThemeRoot>
      <AboutPage title="Workspaces">
        <Tabs.Root defaultValue="browse">
          <Tabs.List>
            <Tabs.Trigger value="browse">Browse</Tabs.Trigger>
            <Tabs.Trigger value="publish">Publish</Tabs.Trigger>
            <Tabs.Trigger value="installed">Installed</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="browse">
            <TemplateBrowser
              client={templates}
              listSourceAccounts={listSourceAccounts}
              onOpenInApp={async ({ pin }) => {
                window.location.assign(
                  createShellSurfaceLink({
                    kind: "workspace-chooser",
                    template: pin,
                  }),
                );
              }}
            />
          </Tabs.Content>
          <Tabs.Content value="installed">
            {workspaceId && (
              <TemplateInstalled
                client={templates}
                workspaceId={workspaceId}
                key={workspaceId}
              />
            )}
          </Tabs.Content>
          <Tabs.Content value="publish">
            {workspaceId && (
              <TemplateAuthoring
                listAccounts={listSourceAccounts}
                key={workspaceId}
                workspaceId={workspaceId}
                client={templates}
              />
            )}
          </Tabs.Content>
        </Tabs.Root>
      </AboutPage>
    </AboutThemeRoot>
  );
}
