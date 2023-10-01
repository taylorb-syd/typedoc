import { JSX } from "../../../../utils";
import type { DefaultHtmlRenderContext } from "../DefaultHtmlRenderContext";

export function footer(context: DefaultHtmlRenderContext) {
    const hideGenerator = context.options.getValue("hideGenerator");
    if (!hideGenerator)
        return (
            <div class="tsd-generator">
                <p>
                    {"Generated using "}
                    <a href="https://typedoc.org/" rel="noopener" target="_blank">
                        TypeDoc
                    </a>
                </p>
            </div>
        );
}
