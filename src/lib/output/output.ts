import type { Renderer } from "./renderer";
import { EventDispatcher } from "../utils";
import type { Application } from "../application";
import type { ProjectReflection } from "../models";

export interface MinimalDocument {
    filename: string;
}

/**
 * The Router class of an Output determines which files the output
 * will write and the relations between those documents. Not that this
 * interface doesn't actually require a `urlTo` method because even single
 * file outputs that don't have any links have a minimal router.
 */
export abstract class Router<TDocument extends MinimalDocument> {
    /**
     * Will not be set when {@link getDocuments} is called, but will be set
     * before any url resolution methods are called.
     */
    currentDocument!: TDocument;

    constructor(readonly basePath: string) {}

    abstract getDocuments(project: ProjectReflection): TDocument[];

    setCurrentDocument(doc: TDocument) {
        this.currentDocument = doc;
    }
}

/**
 * Base class of all output types.
 *
 * 0-N outputs may be enabled by the user. When enabled, the {@link Renderer} will construct
 * and instance of the requested class and use it to write a project to disc. The output class
 * will then be deleted; in watch mode, this means the class may be constructed many times.
 *
 * The renderer will first call {@link Output.getRouter} which will be used to list the files
 * to be written, and will be updated with each page being rendered. The router will also be
 * passed to the {@link Output.render} function so that it can be used to link to other pages
 * if desired.
 *
 * The {@link Output.render} function is responsible for turning a document into a string which
 * will be written to disc.
 */
export abstract class Output<
    TDocument extends MinimalDocument,
    TEvents extends Record<keyof TEvents, unknown[]> = {},
> extends EventDispatcher<TEvents> {
    /**
     * Will be set to the result of {@link buildRouter}
     */
    public router!: ReturnType<(typeof this)["buildRouter"]>;

    /**
     * Will be called once before any calls to {@link render}.
     */
    async setup(_app: Application): Promise<void> {}

    /**
     * Will be called once after all calls to {@link render}.
     */
    async teardown(_app: Application): Promise<void> {}

    /**
     * Called once after {@link setup} to get the router which will be used to get the
     * documents to render.
     */
    abstract buildRouter(basePath: string): Router<TDocument>;

    /**
     * Renders the provided page to a string, which will be written to disk by the {@link Renderer}
     * This will be called for each document rendered by {@link Router.getDocuments}.
     */
    abstract render(document: TDocument): string | Promise<string>;
}
