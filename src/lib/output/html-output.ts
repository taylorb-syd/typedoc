import { posix } from "path";
import type { Application } from "../application";
import {
    DeclarationReflection,
    ProjectReflection,
    Reflection,
    ReflectionKind,
    SignatureReflection,
} from "../models";
import { EventHooks, JSX, Option } from "../utils";
import { setRenderSettings } from "../utils/jsx";
import type { JsxElement } from "../utils/jsx.elements";
import type { MarkdownEvent } from "./events";
import { MinimalDocument, Output } from "./output";
import type { DefaultHtmlRenderContext } from "./themes/default/DefaultHtmlRenderContext";

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
 * The minimal interface that must be met for a render context to be used by {@link HtmlOutput}
 */
export interface HtmlRenderContext {
    indexTemplate: (doc: HtmlOutputDocument) => JsxElement;
    reflectionTemplate: (doc: HtmlOutputDocument) => JsxElement;
    defaultLayout(
        template: (doc: HtmlOutputDocument) => JsxElement,
        document: HtmlOutputDocument,
    ): JsxElement;
}

/**
 * Describes the hooks available to inject output in the default theme.
 * If the available hooks don't let you put something where you'd like, please open an issue!
 */
export interface HtmlRendererHooks {
    /**
     * Applied immediately after the opening `<head>` tag.
     */
    "head.begin": [DefaultHtmlRenderContext];

    /**
     * Applied immediately before the closing `</head>` tag.
     */
    "head.end": [DefaultHtmlRenderContext];

    /**
     * Applied immediately after the opening `<body>` tag.
     */
    "body.begin": [DefaultHtmlRenderContext];

    /**
     * Applied immediately before the closing `</body>` tag.
     */
    "body.end": [DefaultHtmlRenderContext];

    /**
     * Applied immediately before the main template.
     */
    "content.begin": [DefaultHtmlRenderContext];

    /**
     * Applied immediately after the main template.
     */
    "content.end": [DefaultHtmlRenderContext];

    /**
     * Applied immediately before calling `context.sidebar`.
     */
    "sidebar.begin": [DefaultHtmlRenderContext];

    /**
     * Applied immediately after calling `context.sidebar`.
     */
    "sidebar.end": [DefaultHtmlRenderContext];

    /**
     * Applied immediately before calling `context.pageSidebar`.
     */
    "pageSidebar.begin": [DefaultHtmlRenderContext];

    /**
     * Applied immediately after calling `context.pageSidebar`.
     */
    "pageSidebar.end": [DefaultHtmlRenderContext];
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

export abstract class HtmlOutputRouter {
    // Optimization to speed up relativeUrl for rendering strategies which place most
    // links within a single directory.
    private _absoluteToRelativePathMap = new Map<string, string>();
    // dir => files
    // We need this so that if we have two reflections which share a name in a directory
    // we don't overwrite the first file with another one.
    // private _aliases = new Map<string, Set<string>>(); GERRIT

    private _renderStartTime = Date.now();
    private _location = "";
    private _hasOwnDocument = new Set<Reflection>();
    protected urls = new Map<Reflection, string>();
    protected anchors = new Map<Reflection, string>();

    @Option("cacheBust")
    accessor cacheBust!: boolean;

    constructor(readonly application: Application) {}

    setCurrentDocument(doc: HtmlOutputDocument): void {
        this._location = posix.dirname(doc.filename);
    }

    getFullUrl(refl: Reflection) {
        return this.urls.get(refl);
    }

    getAnchor(refl: Reflection) {
        return this.anchors.get(refl);
    }

    hasOwnDocument = (refl: Reflection) => {
        return this._hasOwnDocument.has(refl);
    };

    urlTo(refl: Reflection) {
        const url = this.urls.get(refl);
        return url ? this.relativeUrl(url) : undefined;
    }

    relativeUrl(absolute: string, cacheBust = false) {
        if (URL_PREFIX.test(absolute)) {
            return absolute;
        }

        const key = `${this._location}:${absolute}`;
        let path = this._absoluteToRelativePathMap.get(key);
        if (path) return path;

        path = posix.relative(this._location, absolute) || ".";
        if (cacheBust && this.cacheBust) {
            path += `?cache=${this._renderStartTime}`;
        }
        this._absoluteToRelativePathMap.set(key, path);
        return path;
    }

    getDocuments(project: ProjectReflection): HtmlOutputDocument[] {
        const docs = this.buildDocuments(project);
        this._hasOwnDocument = new Set(docs.map((d) => d.model));
        return docs;
    }

    /**
     * Responsible for iterating through the project's children and creating
     * {@link HtmlOutputDocument}s for each page that should be created.
     * Also responsible for building the {@link urls} and {@link anchors} maps for link resolution.
     */
    abstract buildDocuments(project: ProjectReflection): HtmlOutputDocument[];
}

export class KindFolderHtmlOutputRouter extends HtmlOutputRouter {
    @Option("readme")
    accessor readme!: string;

    override buildDocuments(project: ProjectReflection): HtmlOutputDocument[] {
        const outputs: HtmlOutputDocument[] = [];

        if (!hasReadme(this.readme)) {
            this.urls.set(project, "index.html");
            outputs.push(
                new HtmlOutputDocument(
                    project,
                    project,
                    "index.html",
                    "reflection",
                ),
            );
        } else if (
            project.children?.every((c) => c.kindOf(ReflectionKind.Module))
        ) {
            // If there are no non-module children, then there's no point in having a modules page since there
            // will be nothing on it besides the navigation, so redirect the module page to the readme page
            this.urls.set(project, "index.html");
            outputs.push(
                new HtmlOutputDocument(project, project, "index.html", "index"),
            );
        } else {
            this.urls.set(project, "modules.html");
            outputs.push(
                new HtmlOutputDocument(project, project, "index.html", "index"),
            );
            outputs.push(
                new HtmlOutputDocument(
                    project,
                    project,
                    "modules.html",
                    "reflection",
                ),
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

            this.urls.set(reflection, url);
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

        this.urls.set(reflection, `${this.urls.get(container)}#${anchor}`);
        this.anchors.set(reflection, anchor);
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

    /**
     * Set during rendering, but not during setup.
     */
    public router!: HtmlOutputRouter;

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

    abstract buildRouter(): HtmlOutputRouter;

    /**
     * By default, enables syntax highlighting.
     */
    override async setup(app: Application) {
        setRenderSettings({ pretty: app.options.getValue("pretty") });
        await app.getPlugin("typedoc:marked").loadHighlighter();
    }

    override getDocuments(project: ProjectReflection): HtmlOutputDocument[] {
        this.router = this.buildRouter();
        return this.router.getDocuments(project);
    }

    abstract getRenderContext(document: HtmlOutputDocument): HtmlRenderContext;

    override render(document: HtmlOutputDocument): string | Promise<string> {
        this.router.setCurrentDocument(document);
        const context = this.getRenderContext(document);
        const template =
            document.template === "index"
                ? context.indexTemplate
                : context.reflectionTemplate;
        const templateOutput = context.defaultLayout(template, document);
        return "<!DOCTYPE html>" + JSX.renderElement(templateOutput);
    }
}

function hasReadme(readme: string) {
    return !readme.endsWith("none");
}
