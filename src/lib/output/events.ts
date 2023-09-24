import type { ProjectReflection } from "../models/reflections/project";
import type { HtmlOutputDocument } from "./html-output";
import type { MinimalDocument } from "./output";

/**
 * An event emitted by the {@link Renderer} class at the very beginning and
 * ending of the entire rendering process.
 *
 * @see {@link Renderer.EVENT_BEGIN}
 * @see {@link Renderer.EVENT_END}
 */
export class RendererEvent {
    /**
     * The project the renderer is currently processing.
     */
    readonly project: ProjectReflection;

    /**
     * The path of the directory the documentation should be written to.
     */
    readonly outputDirectory: string;

    /**
     * Triggered before the renderer starts rendering a project.
     * @event
     */
    static readonly BEGIN = "beginRender";

    /**
     * Triggered after the renderer has written all documents.
     * @event
     */
    static readonly END = "endRender";

    constructor(outputDirectory: string, project: ProjectReflection) {
        this.outputDirectory = outputDirectory;
        this.project = project;
    }
}

/**
 * An event emitted by the {@link Renderer} class before and after the
 * markup of a page is rendered.
 *
 * @see {@link Renderer.EVENT_BEGIN_PAGE}
 * @see {@link Renderer.EVENT_END_PAGE}
 */
export class PageEvent<out TDocument extends MinimalDocument> {
    /**
     * The project the renderer is currently processing.
     */
    readonly project: ProjectReflection;

    /**
     * The model that should be rendered on this page.
     */
    readonly document: TDocument;

    /**
     * The final html content of this page.
     *
     * Should be rendered by layout templates and can be modified by plugins
     * during the {@link END} event.
     */
    contents?: string;

    /**
     * Triggered before a document will be rendered.
     * @event
     */
    static readonly BEGIN = "beginPage";

    /**
     * Triggered after a document has been rendered, just before it is written to disc.
     * @event
     */
    static readonly END = "endPage";

    constructor(project: ProjectReflection, model: TDocument) {
        this.project = project;
        this.document = model;
    }
}

/**
 * An event emitted when markdown is being parsed. Allows other plugins to manipulate the result.
 *
 * @see {@link MarkdownEvent.PARSE}
 * @see {@link MarkdownEvent.INCLUDE}
 */
export class MarkdownEvent {
    /**
     * The unparsed original text.
     */
    readonly originalText: string;

    /**
     * The parsed output.
     */
    parsedText: string;

    /**
     * The page that this markdown is being parsed for.
     */
    readonly page: HtmlOutputDocument;

    /**
     * Triggered on the HtmlOutput instance when this plugin parses a markdown string.
     * @event
     */
    static readonly PARSE = "parseMarkdown";

    /**
     * Triggered on the HtmlOutput instance when this plugin includes a markdown file through a markdown include tag.
     * @event
     */
    static readonly INCLUDE = "includeMarkdown";

    constructor(
        page: HtmlOutputDocument,
        originalText: string,
        parsedText: string,
    ) {
        this.page = page;
        this.originalText = originalText;
        this.parsedText = parsedText;
    }
}
