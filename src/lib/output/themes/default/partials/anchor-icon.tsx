import { JSX } from "../../../../utils";
import type { DefaultHtmlRenderContext } from "../DefaultHtmlRenderContext";

export function anchorIcon(context: DefaultHtmlRenderContext, anchor: string | undefined) {
    if (!anchor) return <></>;

    return (
        <a href={`#${anchor}`} aria-label="Permalink" class="tsd-anchor-icon">
            {context.icons.anchor()}
        </a>
    );
}
