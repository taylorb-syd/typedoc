import type { DefaultHtmlRenderContext } from "../DefaultHtmlRenderContext";
import { JSX, Raw } from "../../../../utils";
import type { HtmlOutputDocument } from "../../../html-output";

export const indexTemplate = ({ markdown }: DefaultHtmlRenderContext, props: HtmlOutputDocument) => (
    <div class="tsd-panel tsd-typography">
        <Raw html={markdown(props.model.readme || [])} />
    </div>
);
