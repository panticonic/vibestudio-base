import { createTypedRpcServiceClient } from "@vibestudio/shared/typedRpcServiceClient";
import { Button, Flex, Text } from "@radix-ui/themes";
import { credentialsMethods } from "@vibestudio/service-schemas/credentials";

import { buildPanelLink, extensions, rpc } from "@workspace/runtime";
import { createShellSurfaceLink } from "@vibestudio/shared/shellSurface";
import { createTemplateManagementClient } from "@workspace/template-management";
import { TemplateBrowser } from "@workspace/react/templates";
import { AboutPage, AboutThemeRoot } from "@workspace/about-shared/ui";

const templates = createTemplateManagementClient((extension, method, args) =>
  extensions.invoke(extension, method, args),
);
const accounts = createTypedRpcServiceClient(rpc, { targetId: "main", namespace: "credentials" }, credentialsMethods);
const listSourceAccounts = () => accounts.listStoredCredentials();
export default function TemplatesPage() {
  return (
    <AboutThemeRoot>
      <AboutPage
        title="Workspaces"
        subtitle="Start a separate space for your work."
        maxWidth={1040}
      >
        <Flex gap="3" wrap="wrap" mb="5">
          <Button size="3" asChild>
            <a href={createShellSurfaceLink({ kind: "workspace-chooser" })}>
              Add workspace
            </a>
          </Button>
          <Button size="3" variant="soft" asChild>
            <a href={buildPanelLink("about/workspace")}>
              Manage this workspace
            </a>
          </Button>
        </Flex>
        <Text as="p" color="gray" mb="4">
          Choose a template to start a new workspace. Updates and publishing for
          your current workspace are under Manage this workspace.
        </Text>
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
      </AboutPage>
    </AboutThemeRoot>
  );
}
