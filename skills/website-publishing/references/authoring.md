# Authoring a portable panel website

Use one panel package with one application component. The panel's `entry`
exports the installed panel component. `website.entry` points to a browser file
that mounts that component into `#root`.

```json
{
  "vibestudio": {
    "entry": "index.tsx",
    "website": {
      "entry": "site.tsx",
      "title": "My site",
      "expects": "Works best with a workspace that exposes the project service",
      "suggestedTemplates": [
        {
          "label": "Project workspace",
          "locator": { "url": "https://example.com/template" }
        }
      ]
    }
  }
}
```

`expects` and template locators are hints. They never block a build and are not
resolved as dependencies; the agent checks what the workspace actually provides
and adapts. The website bundle must be self-contained: undeclared external
imports fail the build.

Connected web pages use the standard `@workspace/runtime` connection flow from
[workspace website development](../../workspace-dev/WEBSITES.md). Publishing a
site does not grant it workspace access, and connecting to a workspace does not
grant permission to publish.
