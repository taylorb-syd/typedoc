import { posix } from "path";
import type { Application } from "../application";
import {
    DeclarationReflection,
    ProjectReflection,
    Reflection,
    ReflectionKind,
    SignatureReflection,
} from "../models";
import { EventHooks, Option } from "../utils";
import { setRenderSettings } from "../utils/jsx";
import type { JsxElement } from "../utils/jsx.elements";
import type { MarkdownEvent } from "./events";
import { MinimalDocument, Output, Router } from "./output";
import type { DefaultThemeRenderContext } from "./themes/default/DefaultThemeRenderContext";

export interface NavigationElement {
    text: string;
    path?: string;
    kind?: ReflectionKind;
    class?: string;
    children?: NavigationElement[];
}

export interface HtmlOutputEvents {
    parseMarkdown: [MarkdownEvent];
    includeMarkdown: [MarkdownEvent];
}

export class HtmlOutputDocument implements MinimalDocument {
    pageHeadings: Array<{
        link: string;
        text: string;
        level?: number;
        kind?: ReflectionKind;
        classes?: string;
    }> = [];

    constructor(
        readonly project: ProjectReflection,
        readonly model: DeclarationReflection | ProjectReflection,
        readonly filename: string,
        readonly template: "reflection" | "index",
    ) {}
}

/**
 * Describes the hooks available to inject output in the default theme.
 * If the available hooks don't let you put something where you'd like, please open an issue!
 */
export interface HtmlRendererHooks {
    /**
     * Applied immediately after the opening `<head>` tag.
     */
    "head.begin": [DefaultThemeRenderContext];

    /**
     * Applied immediately before the closing `</head>` tag.
     */
    "head.end": [DefaultThemeRenderContext];

    /**
     * Applied immediately after the opening `<body>` tag.
     */
    "body.begin": [DefaultThemeRenderContext];

    /**
     * Applied immediately before the closing `</body>` tag.
     */
    "body.end": [DefaultThemeRenderContext];

    /**
     * Applied immediately before the main template.
     */
    "content.begin": [DefaultThemeRenderContext];

    /**
     * Applied immediately after the main template.
     */
    "content.end": [DefaultThemeRenderContext];

    /**
     * Applied immediately before calling `context.sidebar`.
     */
    "sidebar.begin": [DefaultThemeRenderContext];

    /**
     * Applied immediately after calling `context.sidebar`.
     */
    "sidebar.end": [DefaultThemeRenderContext];

    /**
     * Applied immediately before calling `context.pageSidebar`.
     */
    "pageSidebar.begin": [DefaultThemeRenderContext];

    /**
     * Applied immediately after calling `context.pageSidebar`.
     */
    "pageSidebar.end": [DefaultThemeRenderContext];
}

const kindMappings = new Map([
    [ReflectionKind.Class, "classes"],
    [ReflectionKind.Interface, "interfaces"],
    [ReflectionKind.Enum, "enums"],
    [ReflectionKind.Namespace, "modules"],
    [ReflectionKind.Module, "modules"],
    [ReflectionKind.TypeAlias, "types"],
    [ReflectionKind.Function, "functions"],
    [ReflectionKind.Variable, "variables"],
]);

const URL_PREFIX = /^(http|ftp)s?:\/\//;

export abstract class HtmlOutputRouter extends Router<HtmlOutputDocument> {
    private absoluteToRelativePathMap = new Map<string, string>();
    private renderStartTime = Date.now();
    private location = "";

    @Option("cacheBust")
    accessor cacheBust!: boolean;

    constructor(
        basePath: string,
        readonly application: Application,
    ) {
        super(basePath);
    }

    override setCurrentDocument(doc: HtmlOutputDocument): void {
        super.setCurrentDocument(doc);
        this.location = posix.dirname(doc.filename);
    }

    urlTo(refl: Reflection) {
        return refl.url ? this.relativeUrl(refl.url) : undefined;
    }

    relativeUrl(absolute: string, cacheBust = false) {
        if (URL_PREFIX.test(absolute)) {
            return absolute;
        }

        const key = `${this.location}:${absolute}`;
        let path = this.absoluteToRelativePathMap.get(key);
        if (path) return path;
        path = posix.relative(this.location, absolute) || ".";
        if (cacheBust && this.cacheBust) {
            path += `?cache=${this.renderStartTime}`;
        }
        this.absoluteToRelativePathMap.set(key, path);
        return path;
    }
}

export class KindFolderHtmlOutputRouter extends HtmlOutputRouter {
    @Option("readme")
    accessor readme!: string;

    override getDocuments(project: ProjectReflection): HtmlOutputDocument[] {
        const outputs: HtmlOutputDocument[] = [];

        if (!hasReadme(this.readme)) {
            project.url = "index.html";
            outputs.push(
                new HtmlOutputDocument(
                    project,
                    project,
                    project.url,
                    "reflection",
                ),
            );
        } else if (
            project.children?.every((c) => c.kindOf(ReflectionKind.Module))
        ) {
            // If there are no non-module children, then there's no point in having a modules page since there
            // will be nothing on it besides the navigation, so redirect the module page to the readme page
            project.url = "index.html";
            outputs.push(
                new HtmlOutputDocument(project, project, project.url, "index"),
            );
        } else {
            project.url = "modules.html";
            outputs.push(
                new HtmlOutputDocument(
                    project,
                    project,
                    project.url,
                    "reflection",
                ),
            );
            outputs.push(
                new HtmlOutputDocument(project, project, "index.html", "index"),
            );
        }

        project.children?.forEach((c) =>
            this.buildOutputs(project, c, outputs),
        );

        return outputs;
    }

    private buildOutputs(
        project: ProjectReflection,
        reflection: DeclarationReflection,
        outputs: HtmlOutputDocument[],
    ) {
        const mapping = kindMappings.get(reflection.kind);
        if (mapping) {
            const url = [mapping, this.getUrl(reflection) + ".html"].join("/");

            outputs.push(
                new HtmlOutputDocument(project, reflection, url, "reflection"),
            );

            reflection.url = url;
            reflection.hasOwnDocument = true;

            reflection.traverse((child) => {
                if (child instanceof DeclarationReflection) {
                    this.buildOutputs(project, child, outputs);
                } else {
                    this.applyAnchorUrl(child, reflection);
                }
                return true;
            });
        } else if (reflection.parent) {
            this.applyAnchorUrl(reflection, reflection.parent);
        }
    }

    private applyAnchorUrl(reflection: Reflection, container: Reflection) {
        if (
            !(reflection instanceof DeclarationReflection) &&
            !(reflection instanceof SignatureReflection)
        ) {
            return;
        }

        const anchor = this.getUrl(reflection, container);

        reflection.url = container.url + "#" + anchor;
        reflection.anchor = anchor;
        reflection.hasOwnDocument = false;

        reflection.traverse((child) => {
            this.applyAnchorUrl(child, container);
            return true;
        });
    }

    private getUrl(reflection: Reflection, relative?: Reflection): string {
        let url = reflection.getAlias();

        if (
            reflection.parent &&
            reflection.parent !== relative &&
            !(reflection.parent instanceof ProjectReflection)
        ) {
            url = this.getUrl(reflection.parent, relative) + "." + url;
        }

        return url;
    }
}

/**
 * Base class for HTML based themes which use TypeDoc's JSX rendering.
 */
export abstract class HtmlOutput<
    TEvents extends Record<keyof TEvents, unknown[]>,
> extends Output<HtmlOutputDocument, TEvents & HtmlOutputEvents> {
    private _navigationCache: NavigationElement[] | undefined;

    @Option("cacheBust")
    accessor cacheBust!: boolean;

    constructor(readonly application: Application) {
        super();
    }

    /**
     * Hooks which will be called when rendering pages.
     * Hooks added during a page render will be discarded at the end of that page's render.
     *
     * See {@link HtmlRendererHooks} for a description of each available hook, and when it will be called.
     */
    hooks = new EventHooks<HtmlRendererHooks, JsxElement>();

    parseMarkdown(md: string) {
        return this.application.getPlugin("typedoc:marked").parseMarkdown(md);
    }

    /**
     * Optional method to retrieve classes associated with a reflection for use when rendering.
     * These will be saved in the search index so that search results can be styled with them.
     */
    abstract getReflectionClasses(reflection: DeclarationReflection): string;

    /**
     * Optional method to retrieve the navigation tree to be displayed. In the default theme,
     * this is written to a navigation.js file and loaded dynamically.
     *
     * If present, the result should be cached as it may be called many times.
     *
     * If implementing a custom theme, it is recommended to override {@link buildNavigation} instead.
     */
    getNavigation(project: ProjectReflection): NavigationElement[] {
        // This is ok because currently TypeDoc wipes out the theme after each render.
        // Might need to change in the future, but it's fine for now.
        this._navigationCache ||= this.buildNavigation(project);
        return this._navigationCache;
    }

    /**
     * Builds the navigation, will be cached by getNavigation.
     */
    abstract buildNavigation(project: ProjectReflection): NavigationElement[];

    abstract override buildRouter(basePath: string): HtmlOutputRouter;

    /**
     * By default, enables syntax highlighting.
     */
    override async setup(app: Application) {
        setRenderSettings({ pretty: app.options.getValue("pretty") });
        await app.getPlugin("typedoc:marked").loadHighlighter();
    }
}

function hasReadme(readme: string) {
    return !readme.endsWith("none");
}
