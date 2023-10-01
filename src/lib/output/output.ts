import type { Renderer } from "./renderer";
import { EventDispatcher } from "../utils";
import type { Application } from "../application";
import type { ProjectReflection } from "../models";

export interface MinimalDocument {
    filename: string;
}

/**
 * Base class of all output types.
 *
 * 0-N outputs may be enabled by the user. When enabled, the {@link Renderer} will construct
 * and instance of the requested class and use it to write a project to disc. The output class
 * will then be deleted; in watch mode, this means the class may be constructed many times.
 *
 * The renderer will first call {@link Output.getDocuments} which will be used to list the files
 * to be written. Each document returned will be passed to the {@link Output.render} function
 * to render to a string which will be written to disc.
 *
 * The {@link Output.render} function is responsible for turning a document into a string which
 * will be written to disc.
 */
export abstract class Output<
    TDocument extends MinimalDocument,
    TEvents extends Record<keyof TEvents, unknown[]> = {},
> extends EventDispatcher<TEvents> {
    /**
     * Will be called once before any calls to {@link render}.
     */
    async setup(_app: Application): Promise<void> {}

    /**
     * Will be called once after all calls to {@link render}.
     */
    async teardown(_app: Application): Promise<void> {}

    /**
     * Called once after {@link setup} to get the documents which should be passed to {@link render}.
     * The filenames of all returned documents should be
     */
    abstract getDocuments(project: ProjectReflection): TDocument[];

    /**
     * Renders the provided page to a string, which will be written to disk by the {@link Renderer}
     * This will be called for each document returned by {@link getDocuments}.
     */
    abstract render(document: TDocument): string | Promise<string> | Buffer;
}
