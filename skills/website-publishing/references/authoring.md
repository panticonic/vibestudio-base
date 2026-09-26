# Authoring a portable panel website

Keep one panel package and one application component. The normal `entry` exports
the installed panel component. `website.entry` points to a browser file that
mounts that component into `#root`.

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

`expects` and template locators express intent. They never block a build and do
not form a dependency solver. The agent inspects live capabilities and adapts.
The website bundle must be self contained: undeclared external imports are a
build error.

Connected web pages use the ordinary `@workspace/runtime` connection flow from
[workspace website development](../../workspace-dev/WEBSITES.md). Publication
does not grant workspace access, and workspace connection does not grant
publication authority.
