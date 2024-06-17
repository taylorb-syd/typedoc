import type { DefaultHtmlRenderContext } from "../DefaultHtmlRenderContext";
import { JSX } from "../../../../utils";
import type { DeclarationReflection } from "../../../../models";
import { anchorIcon } from "./anchor-icon";
import { classNames } from "../../lib";

export const memberSignatures = (context: DefaultHtmlRenderContext, props: DeclarationReflection) => (
    <>
        <ul class={classNames({ "tsd-signatures": true }, context.getReflectionClasses(props))}>
            {props.signatures?.map((item) => {
                const anchor = context.router.getAnchor(item);
                return (
                    <>
                        <li class="tsd-signature tsd-anchor-link" id={anchor}>
                            {context.memberSignatureTitle(item)}
                            {anchorIcon(context, anchor)}
                        </li>
                        <li class="tsd-description">{context.memberSignatureBody(item)}</li>
                    </>
                );
            })}
        </ul>
    </>
);
