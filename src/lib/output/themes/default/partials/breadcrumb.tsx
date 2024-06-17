import type { DefaultHtmlRenderContext } from "../DefaultHtmlRenderContext";
import { JSX } from "../../../../utils";
import type { Reflection } from "../../../../models";

export function breadcrumb(context: DefaultHtmlRenderContext, props: Reflection): JSX.Element | undefined {
    const target = context.urlTo(props);

    if (props.parent) {
        return (
            <>
                {context.breadcrumb(props.parent)}
                <li>{target ? <a href={target}>{props.name}</a> : <span>{props.name}</span>}</li>
            </>
        );
    }

    if (target) {
        return (
            <li>
                <a href={target}>{props.name}</a>
            </li>
        );
    }
}
