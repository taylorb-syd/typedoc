import type { DeclarationReflection } from "../../../../models";
import { JSX } from "../../../../utils";
import { classNames } from "../../lib";
import type { DefaultHtmlRenderContext } from "../DefaultHtmlRenderContext";

export const memberGetterSetter = (context: DefaultHtmlRenderContext, props: DeclarationReflection) => (
    <>
        <ul
            class={classNames(
                {
                    "tsd-signatures": true,
                },
                context.getReflectionClasses(props),
            )}
        >
            {!!props.getSignature && (
                <>
                    <li class="tsd-signature" id={context.router.getAnchor(props.getSignature)}>
                        <span class="tsd-signature-symbol">get</span> {props.name}
                        {context.memberSignatureTitle(props.getSignature, {
                            hideName: true,
                        })}
                    </li>
                    <li class="tsd-description">{context.memberSignatureBody(props.getSignature)}</li>
                </>
            )}
            {!!props.setSignature && (
                <>
                    <li class="tsd-signature" id={context.router.getAnchor(props.setSignature)}>
                        <span class="tsd-signature-symbol">set</span> {props.name}
                        {context.memberSignatureTitle(props.setSignature, {
                            hideName: true,
                        })}
                    </li>
                    <li class="tsd-description">{context.memberSignatureBody(props.setSignature)}</li>
                </>
            )}
        </ul>
    </>
);
