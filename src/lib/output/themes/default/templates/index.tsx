import type { DefaultThemeRenderContext } from "../DefaultThemeRenderContext";
import { JSX, Raw } from "../../../../utils";
import type { HtmlOutputDocument } from "../../../html-output";

export const indexTemplate = ({ markdown }: DefaultThemeRenderContext, props: HtmlOutputDocument) => (
    <div class="tsd-panel tsd-typography">
        <Raw html={markdown(props.model.readme || [])} />
    </div>
);
