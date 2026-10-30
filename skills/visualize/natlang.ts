import chooseComponent from "./chooseComponent.nl";
import readProps from "./readProps.nl";
import { renderComponent } from "./render.js";
import type { DataComponent, RenderedComponent } from "./types.js";

export { chooseComponent };

/**
 * Build one response component from data: the small model reads the facts into
 * typed props, `renderComponent` validates them strictly and writes the MDX tag.
 * A rejected prop set throws a `ComponentPropsError` that names what to change.
 */
export async function componentProps(data: string, component: DataComponent): Promise<RenderedComponent> {
  return renderComponent(await readProps(data, component));
}
