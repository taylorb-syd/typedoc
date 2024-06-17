import { classNames, renderName } from "../../lib";
import type { DefaultHtmlRenderContext } from "../DefaultHtmlRenderContext";
import { JSX } from "../../../../utils";
import type { ContainerReflection, ReflectionCategory } from "../../../../models";

function renderCategory(
    { urlTo, icons, getReflectionClasses }: DefaultHtmlRenderContext,
    item: ReflectionCategory,
    prependName = "",
) {
    return (
        <section class="tsd-index-section">
            <h3 class="tsd-index-heading">{prependName ? `${prependName} - ${item.title}` : item.title}</h3>
            <div class="tsd-index-list">
                {item.children.map((item) => (
                    <>
                        <a
                            href={urlTo(item)}
                            class={classNames(
                                { "tsd-index-link": true, deprecated: item.isDeprecated() },
                                getReflectionClasses(item),
                            )}
                        >
                            {icons[item.kind]()}
                            <span>{renderName(item)}</span>
                        </a>
                        {"\n"}
                    </>
                ))}
            </div>
        </section>
    );
}

export function index(context: DefaultHtmlRenderContext, props: ContainerReflection) {
    let content: JSX.Element | JSX.Element[] = [];
    // Accordion is only needed if any children will be rendered on this page.
    let needsAccordion = false;

    if (props.categories?.length) {
        content = props.categories.map((item) => renderCategory(context, item));
        needsAccordion = !props.categories.every((cat) => cat.every(context.router.hasOwnDocument));
    } else if (props.groups?.length) {
        content = props.groups.flatMap((item) =>
            item.categories
                ? item.categories.map((item2) => renderCategory(context, item2, item.title))
                : renderCategory(context, item),
        );
        needsAccordion = !props.groups.every((g) => g.every(context.router.hasOwnDocument));
    }

    if (needsAccordion) {
        content = (
            <details class="tsd-index-content tsd-index-accordion" open={true}>
                <summary class="tsd-accordion-summary tsd-index-summary">
                    <h5 class="tsd-index-heading uppercase" role="button" aria-expanded="false" tabIndex={0}>
                        {context.icons.chevronSmall()} Index
                    </h5>
                </summary>
                <div class="tsd-accordion-details">{content}</div>
            </details>
        );
    } else {
        content = (
            <>
                <h3 class="tsd-index-heading uppercase">Index</h3>
                {content}
            </>
        );
    }

    return (
        <>
            <section class="tsd-panel-group tsd-index-group">
                <section class="tsd-panel tsd-index-panel">{content}</section>
            </section>
        </>
    );
}
