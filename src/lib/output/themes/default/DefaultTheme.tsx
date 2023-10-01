import {
    Reflection,
    ReflectionKind,
    ProjectReflection,
    DeclarationReflection,
    ReflectionCategory,
    ReflectionGroup,
} from "../../../models";
import { JSX, Option } from "../../../utils";
import { classNames, getDisplayName, toStyleClass } from "../lib";
import {
    HtmlOutput,
    HtmlOutputDocument,
    HtmlOutputRouter,
    KindFolderHtmlOutputRouter,
    NavigationElement,
} from "../../html-output";
import { DefaultThemeRenderContext } from "./DefaultThemeRenderContext";

export class DefaultHtmlOutput<TEvents extends Record<keyof TEvents, unknown[]>> extends HtmlOutput<TEvents> {
    @Option("visibilityFilters")
    accessor visibilityFilters!: Record<string, boolean>;

    override buildRouter(): HtmlOutputRouter {
        return new KindFolderHtmlOutputRouter(this.application);
    }

    getRenderContext(doc: HtmlOutputDocument): DefaultThemeRenderContext {
        return new DefaultThemeRenderContext(this, doc, this.router, this.application.options);
    }

    override render(document: HtmlOutputDocument): string {
        const context = this.getRenderContext(document);
        const template = document.template === "index" ? context.indexTemplate : context.reflectionTemplate;
        const templateOutput = context.defaultLayout(template, document);
        return "<!DOCTYPE html>" + JSX.renderElement(templateOutput);
    }

    override getReflectionClasses(reflection: DeclarationReflection): string {
        return getReflectionClasses(reflection, this.visibilityFilters);
    }

    override buildNavigation(project: ProjectReflection): NavigationElement[] {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const output = this;
        const opts = this.application.options.getValue("navigation");

        if (opts.fullTree) {
            this.application.logger.warn(
                `The navigation.fullTree option no longer has any affect and will be removed in v0.26`,
            );
        }

        return getNavigationElements(project) || [];

        function toNavigation(
            element: ReflectionCategory | ReflectionGroup | DeclarationReflection,
        ): NavigationElement {
            if (element instanceof ReflectionCategory || element instanceof ReflectionGroup) {
                return {
                    text: element.title,
                    children: getNavigationElements(element),
                };
            }

            return {
                text: getDisplayName(element),
                path: element.url,
                kind: element.kind,
                class: classNames({ deprecated: element.isDeprecated() }, output.getReflectionClasses(element)),
                children: getNavigationElements(element),
            };
        }

        function getNavigationElements(
            parent: ReflectionCategory | ReflectionGroup | DeclarationReflection | ProjectReflection,
        ): undefined | NavigationElement[] {
            if (parent instanceof ReflectionCategory) {
                return parent.children.map(toNavigation);
            }

            if (parent instanceof ReflectionGroup) {
                if (shouldShowCategories(parent.owningReflection, opts) && parent.categories) {
                    return parent.categories.map(toNavigation);
                }
                return parent.children.map(toNavigation);
            }

            if (!parent.kindOf(ReflectionKind.SomeModule | ReflectionKind.Project)) {
                return;
            }

            if (parent.categories && shouldShowCategories(parent, opts)) {
                return parent.categories.map(toNavigation);
            }

            if (parent.groups && shouldShowGroups(parent, opts)) {
                return parent.groups.map(toNavigation);
            }

            return parent.children?.map(toNavigation);
        }

        function shouldShowCategories(
            reflection: Reflection,
            opts: { includeCategories: boolean; includeGroups: boolean },
        ) {
            if (opts.includeCategories) {
                return !reflection.comment?.hasModifier("@hideCategories");
            }
            return reflection.comment?.hasModifier("@showCategories") === true;
        }

        function shouldShowGroups(
            reflection: Reflection,
            opts: { includeCategories: boolean; includeGroups: boolean },
        ) {
            if (opts.includeGroups) {
                return !reflection.comment?.hasModifier("@hideGroups");
            }
            return reflection.comment?.hasModifier("@showGroups") === true;
        }
    }
}

function getReflectionClasses(reflection: DeclarationReflection, filters: Record<string, boolean>) {
    const classes: string[] = [];

    // Filter classes should match up with the settings function in
    // partials/navigation.tsx.
    for (const key of Object.keys(filters)) {
        if (key === "inherited") {
            if (reflection.inheritedFrom) {
                classes.push("tsd-is-inherited");
            }
        } else if (key === "protected") {
            if (reflection.flags.isProtected) {
                classes.push("tsd-is-protected");
            }
        } else if (key === "private") {
            if (reflection.flags.isPrivate) {
                classes.push("tsd-is-private");
            }
        } else if (key === "external") {
            if (reflection.flags.isExternal) {
                classes.push("tsd-is-external");
            }
        } else if (key.startsWith("@")) {
            if (key === "@deprecated") {
                if (reflection.isDeprecated()) {
                    classes.push(toStyleClass(`tsd-is-${key.substring(1)}`));
                }
            } else if (
                reflection.comment?.hasModifier(key as `@${string}`) ||
                reflection.comment?.getTag(key as `@${string}`)
            ) {
                classes.push(toStyleClass(`tsd-is-${key.substring(1)}`));
            }
        }
    }

    return classes.join(" ");
}
