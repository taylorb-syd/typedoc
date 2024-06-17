import type { DefaultHtmlRenderContext } from "../DefaultHtmlRenderContext";
import { JSX } from "../../../../utils";
import { ContainerReflection, DeclarationReflection } from "../../../../models";
import { classNames } from "../../lib";

export function members(context: DefaultHtmlRenderContext, props: ContainerReflection) {
    if (props.categories && props.categories.length) {
        return (
            <>
                {props.categories.map(
                    (item) =>
                        !item.every(context.router.hasOwnDocument) && (
                            <section
                                class={classNames(
                                    { "tsd-panel-group": true, "tsd-member-group": true },
                                    props instanceof DeclarationReflection ? context.getReflectionClasses(props) : "",
                                )}
                            >
                                <h2>{item.title}</h2>
                                {item.children.map((item) => !item.hasOwnDocument && context.member(item))}
                            </section>
                        ),
                )}
            </>
        );
    }

    return <>{props.groups?.map((item) => !item.every(context.router.hasOwnDocument) && context.membersGroup(item))}</>;
}
