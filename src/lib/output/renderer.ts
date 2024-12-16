/**
 * Holds all logic used render and output the final documentation.
 *
 * The {@link Renderer} class is the central controller within this namespace. When invoked it creates
 * an instance of {@link Theme} which defines the layout of the documentation and fires a
 * series of {@link RendererEvent} events. Instances of {@link BasePlugin} can listen to these events and
 * alter the generated output.
 */
import * as fs from "fs";
import * as path from "path";

import type { Application } from "../application.js";
import type { Theme } from "./theme.js";
import {
    RendererEvent,
    PageEvent,
    IndexEvent,
    type MarkdownEvent,
} from "./events.js";
import type { ProjectReflection } from "../models/reflections/project.js";
import { writeFileSync } from "../utils/fs.js";
import { DefaultTheme } from "./themes/default/DefaultTheme.js";
import { Option, AbstractComponent } from "../utils/index.js";
import { loadHighlighter } from "../utils/highlighter.js";
import type {
    BundledLanguage,
    BundledTheme as ShikiTheme,
} from "@gerrit0/mini-shiki";
import type { Comment, Reflection } from "../models/index.js";
import type { DefaultThemeRenderContext } from "./themes/default/DefaultThemeRenderContext.js";
import { EventHooks, JSX } from "#utils";

import {
    AssetsPlugin,
    HierarchyPlugin,
    IconsPlugin,
    JavascriptIndexPlugin,
    MarkedPlugin,
    NavigationPlugin,
    SitemapPlugin,
} from "./plugins/index.js";
import {
    CategoryRouter,
    GroupRouter,
    KindDirRouter,
    KindRouter,
    StructureDirRouter,
    StructureRouter,
    type PageDefinition,
    type Router,
} from "./router.js";

/**
 * Describes the hooks available to inject output in the default theme.
 * If the available hooks don't let you put something where you'd like, please open an issue!
 */
export interface RendererHooks {
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

    /**
     * Applied immediately before the "Generated by TypeDoc" link in the footer.
     */
    "footer.begin": [DefaultThemeRenderContext];

    /**
     * Applied immediately after the "Generated by TypeDoc" link in the footer.
     */
    "footer.end": [DefaultThemeRenderContext];

    /**
     * Applied immediately before a comment's tags are rendered.
     *
     * This may be used to set {@link Models.CommentTag.skipRendering} on any tags which
     * should not be rendered.
     */
    "comment.beforeTags": [DefaultThemeRenderContext, Comment, Reflection];

    /**
     * Applied immediately after a comment's tags are rendered.
     *
     * This may be used to set {@link Models.CommentTag.skipRendering} on any tags which
     * should not be rendered as this hook is called before the tags are actually
     * rendered.
     */
    "comment.afterTags": [DefaultThemeRenderContext, Comment, Reflection];
}

export interface RendererEvents {
    beginRender: [RendererEvent];
    beginPage: [PageEvent<Reflection>];
    endPage: [PageEvent<Reflection>];
    endRender: [RendererEvent];

    parseMarkdown: [MarkdownEvent];
    prepareIndex: [IndexEvent];
}

/**
 * The renderer processes a {@link ProjectReflection} using a {@link Theme} instance and writes
 * the emitted html documents to a output directory. You can specify which theme should be used
 * using the `--theme <name>` command line argument.
 *
 * {@link Renderer} is a subclass of {@link EventDispatcher} and triggers a series of events while
 * a project is being processed. You can listen to these events to control the flow or manipulate
 * the output.
 *
 *  * {@link Renderer.EVENT_BEGIN}<br>
 *    Triggered before the renderer starts rendering a project. The listener receives
 *    an instance of {@link RendererEvent}.
 *
 *    * {@link Renderer.EVENT_BEGIN_PAGE}<br>
 *      Triggered before a document will be rendered. The listener receives an instance of
 *      {@link PageEvent}.
 *
 *    * {@link Renderer.EVENT_END_PAGE}<br>
 *      Triggered after a document has been rendered, just before it is written to disc. The
 *      listener receives an instance of {@link PageEvent}.
 *
 *  * {@link Renderer.EVENT_END}<br>
 *    Triggered after the renderer has written all documents. The listener receives
 *    an instance of {@link RendererEvent}.
 *
 * * {@link Renderer.EVENT_PREPARE_INDEX}<br>
 *    Triggered when the JavascriptIndexPlugin is preparing the search index. Listeners receive
 *    an instance of {@link IndexEvent}.
 *
 * @summary Writes HTML output from TypeDoc's models
 * @group Common
 */
export class Renderer extends AbstractComponent<Application, RendererEvents> {
    private routers = new Map<string, new (app: Application) => Router>([
        ["kind", KindRouter],
        ["structure", StructureRouter],
        ["kind-dir", KindDirRouter],
        ["structure-dir", StructureDirRouter],
        ["group", GroupRouter],
        ["category", CategoryRouter],
    ]);

    private themes = new Map<string, new (renderer: Renderer) => Theme>([
        ["default", DefaultTheme],
    ]);

    /** @event */
    static readonly EVENT_BEGIN_PAGE = PageEvent.BEGIN;
    /** @event */
    static readonly EVENT_END_PAGE = PageEvent.END;
    /** @event */
    static readonly EVENT_BEGIN = RendererEvent.BEGIN;
    /** @event */
    static readonly EVENT_END = RendererEvent.END;

    /** @event */
    static readonly EVENT_PREPARE_INDEX = IndexEvent.PREPARE_INDEX;

    /**
     * A list of async jobs which must be completed *before* rendering output.
     * They will be called after {@link RendererEvent.BEGIN} has fired, but before any files have been written.
     *
     * This may be used by plugins to register work that must be done to prepare output files. For example: asynchronously
     * transform markdown to HTML.
     *
     * Note: This array is cleared after calling the contained functions on each {@link Renderer.render} call.
     */
    preRenderAsyncJobs: Array<(output: RendererEvent) => Promise<void>> = [];

    /**
     * A list of async jobs which must be completed after rendering output files but before generation is considered successful.
     * These functions will be called after all documents have been written to the filesystem.
     *
     * This may be used by plugins to register work that must be done to finalize output files. For example: asynchronously
     * generating an image referenced in a render hook.
     *
     * Note: This array is cleared after calling the contained functions on each {@link Renderer.render} call.
     */
    postRenderAsyncJobs: Array<(output: RendererEvent) => Promise<void>> = [];

    /**
     * The theme that is used to render the documentation.
     */
    theme?: Theme;

    /**
     * The router which is used to determine the pages to render and
     * how to link between pages.
     */
    router?: Router;

    /**
     * Hooks which will be called when rendering pages.
     * Note:
     * - Hooks added during output will be discarded at the end of rendering.
     * - Hooks added during a page render will be discarded at the end of that page's render.
     *
     * See {@link RendererHooks} for a description of each available hook, and when it will be called.
     */
    hooks = new EventHooks<RendererHooks, JSX.Element>();

    /** @internal */
    @Option("theme")
    private accessor themeName!: string;

    /** @internal */
    @Option("router")
    private accessor routerName!: string;

    @Option("cleanOutputDir")
    private accessor cleanOutputDir!: boolean;

    @Option("cname")
    private accessor cname!: string;

    @Option("githubPages")
    private accessor githubPages!: boolean;

    /** @internal */
    @Option("cacheBust")
    accessor cacheBust!: boolean;

    @Option("lightHighlightTheme")
    private accessor lightTheme!: ShikiTheme;

    @Option("darkHighlightTheme")
    private accessor darkTheme!: ShikiTheme;

    @Option("highlightLanguages")
    private accessor highlightLanguages!: string[];

    @Option("ignoredHighlightLanguages")
    private accessor ignoredHighlightLanguages!: string[];

    @Option("pretty")
    private accessor pretty!: boolean;

    renderStartTime = -1;

    markedPlugin: MarkedPlugin;

    constructor(owner: Application) {
        super(owner);

        this.markedPlugin = new MarkedPlugin(this);
        new AssetsPlugin(this);
        new IconsPlugin(this);
        new HierarchyPlugin(this);
        new JavascriptIndexPlugin(this);
        new NavigationPlugin(this);
        new SitemapPlugin(this);
    }

    /**
     * Define a new theme that can be used to render output.
     * This API will likely be changing at some point, to allow more easily overriding parts of the theme without
     * requiring additional boilerplate.
     * @param name
     * @param theme
     */
    defineTheme(name: string, theme: new (renderer: Renderer) => Theme) {
        if (this.themes.has(name)) {
            throw new Error(`The theme "${name}" has already been defined.`);
        }
        this.themes.set(name, theme);
    }

    /**
     * Define a new router that can be used to determine the output structure.
     * @param name
     * @param router
     */
    defineRouter(name: string, router: new (app: Application) => Router) {
        if (this.routers.has(name)) {
            throw new Error(`The router "${name}" has already been defined.`);
        }
        this.routers.set(name, router);
    }

    /**
     * Render the given project reflection to the specified output directory.
     *
     * @param project  The project that should be rendered.
     * @param outputDirectory  The path of the directory the documentation should be rendered to.
     */
    async render(
        project: ProjectReflection,
        outputDirectory: string,
    ): Promise<void> {
        JSX.setRenderSettings({ pretty: this.pretty });

        const momento = this.hooks.saveMomento();
        this.renderStartTime = Date.now();

        if (
            !this.prepareRouter() ||
            !this.prepareTheme() ||
            !(await this.prepareOutputDirectory(outputDirectory))
        ) {
            return;
        }

        const pages = this.router!.buildPages(project);

        const output = new RendererEvent(outputDirectory, project, pages);
        this.trigger(RendererEvent.BEGIN, output);
        await this.runPreRenderJobs(output);

        this.application.logger.verbose(
            `There are ${pages.length} pages to write.`,
        );
        for (const page of pages) {
            this.renderDocument(outputDirectory, page);
        }

        await Promise.all(this.postRenderAsyncJobs.map((job) => job(output)));
        this.postRenderAsyncJobs = [];

        this.trigger(RendererEvent.END, output);

        this.theme = void 0;
        this.router = void 0;
        this.hooks.restoreMomento(momento);
    }

    private async runPreRenderJobs(output: RendererEvent) {
        const start = Date.now();

        this.preRenderAsyncJobs.push(this.loadHighlighter.bind(this));
        await Promise.all(this.preRenderAsyncJobs.map((job) => job(output)));
        this.preRenderAsyncJobs = [];

        this.application.logger.verbose(
            `Pre render async jobs took ${Date.now() - start}ms`,
        );
    }

    private async loadHighlighter() {
        await loadHighlighter(
            this.lightTheme,
            this.darkTheme,
            // Checked in option validation
            this.highlightLanguages as BundledLanguage[],
            this.ignoredHighlightLanguages,
        );
    }

    /**
     * Render a single page.
     *
     * @param page An event describing the current page.
     * @return TRUE if the page has been saved to disc, otherwise FALSE.
     */
    private renderDocument(outputDirectory: string, page: PageDefinition) {
        const momento = this.hooks.saveMomento();

        const event = new PageEvent(page.model);
        event.url = page.url;
        event.filename = path.join(outputDirectory, page.url);
        event.pageKind = page.kind;
        event.project = page.model.project;

        this.trigger(PageEvent.BEGIN, event);

        event.contents = this.theme!.render(event);

        this.trigger(PageEvent.END, event);
        this.hooks.restoreMomento(momento);

        try {
            writeFileSync(event.filename, event.contents);
        } catch (error) {
            this.application.logger.error(
                this.application.i18n.could_not_write_0(event.filename),
            );
        }
    }

    private prepareRouter(): boolean {
        if (!this.theme) {
            const ctor = this.routers.get(this.routerName);
            if (!ctor) {
                this.application.logger.error(
                    this.application.i18n.router_0_is_not_defined_available_are_1(
                        this.routerName,
                        [...this.routers.keys()].join(", "),
                    ),
                );
                return false;
            } else {
                this.router = new ctor(this.application);
            }
        }

        return true;
    }

    private prepareTheme(): boolean {
        if (!this.theme) {
            const ctor = this.themes.get(this.themeName);
            if (!ctor) {
                this.application.logger.error(
                    this.application.i18n.theme_0_is_not_defined_available_are_1(
                        this.themeName,
                        [...this.themes.keys()].join(", "),
                    ),
                );
                return false;
            } else {
                this.theme = new ctor(this);
            }
        }

        return true;
    }

    /**
     * Prepare the output directory. If the directory does not exist, it will be
     * created. If the directory exists, it will be emptied.
     *
     * @param directory  The path to the directory that should be prepared.
     * @returns TRUE if the directory could be prepared, otherwise FALSE.
     */
    private async prepareOutputDirectory(directory: string): Promise<boolean> {
        if (this.cleanOutputDir) {
            try {
                await fs.promises.rm(directory, {
                    recursive: true,
                    force: true,
                });
            } catch (error) {
                this.application.logger.warn(
                    this.application.i18n.could_not_empty_output_directory_0(
                        directory,
                    ),
                );
                return false;
            }
        }

        try {
            fs.mkdirSync(directory, { recursive: true });
        } catch (error) {
            this.application.logger.error(
                this.application.i18n.could_not_create_output_directory_0(
                    directory,
                ),
            );
            return false;
        }

        if (this.githubPages) {
            try {
                const text =
                    "TypeDoc added this file to prevent GitHub Pages from " +
                    "using Jekyll. You can turn off this behavior by setting " +
                    "the `githubPages` option to false.";

                fs.writeFileSync(path.join(directory, ".nojekyll"), text);
            } catch (error) {
                this.application.logger.warn(
                    this.application.i18n.could_not_write_0(
                        path.join(directory, ".nojekyll"),
                    ),
                );
                return false;
            }
        }

        if (this.cname) {
            fs.writeFileSync(path.join(directory, "CNAME"), this.cname);
        }

        return true;
    }
}
