/**
 * Holds all logic used render and output the final documentation.
 *
 * The {@link Renderer} class is the central controller within this namespace. When invoked it creates
 * an instance of {@link Output} which defines the layout of the documentation and fires a
 * series of {@link RendererEvent} events. Instances of {@link BasePlugin} can listen to these events and
 * alter the generated output.
 */
import * as fs from "fs";

import type { Application } from "../application";
import type { MinimalDocument, Output } from "./output";
import { RendererEvent, PageEvent } from "./events";
import type { ProjectReflection } from "../models/reflections/project";
import { writeFileSync } from "../utils/fs";
import { Option, EventDispatcher } from "../utils";
import "./plugins";
import type { OutputOptions } from "../utils/options/declaration";
import { JsonOutput } from "./json-output";
import { DefaultHtmlOutput } from "./themes/default/DefaultTheme";
import { join } from "path";
import { nicePath } from "../utils/paths";

/**
 * Events emitted by the {@link Renderer}.
 * Event listeners should take an argument of the specified type.
 */
interface RendererEvents {
    /**
     * Emitted before a document has been rendered.
     */
    beginPage: [PageEvent<MinimalDocument>];
    /**
     * Emitted after a document has been rendered, but before it has been written to disk.
     */
    endPage: [PageEvent<MinimalDocument>];
    /**
     * Emitted before the renderer starts rendering a project.
     */
    beginRender: [RendererEvent];
    /**
     * Emitted after the renderer has written all documents.
     */
    endRender: [RendererEvent];
}

/**
 * The renderer processes a {@link ProjectReflection} using a {@link Output} instance and writes
 * the emitted html documents to a output directory. You can specify which theme should be used
 * using the `--theme <name>` command line argument.
 *
 * {@link Renderer} is a subclass of {@link EventDispatcher} and triggers a series of events while
 * a project is being processed. You can listen to these events to control the flow or manipulate
 * the output. See {@link RendererEvents} for description of the available events.
 */
export class Renderer extends EventDispatcher<RendererEvents> {
    private outputs = new Map<
        string,
        new (app: Application) => Output<any, any>
    >([
        ["html", DefaultHtmlOutput],
        ["json", JsonOutput],
    ]);

    /** See {@link RendererEvents.beginPage} @event */
    static readonly EVENT_BEGIN_PAGE = PageEvent.BEGIN;
    /** See {@link RendererEvents.endPage} @event */
    static readonly EVENT_END_PAGE = PageEvent.END;
    /** See {@link RendererEvents.beginRender} @event */
    static readonly EVENT_BEGIN = RendererEvent.BEGIN;
    /** See {@link RendererEvents.endRender} @event */
    static readonly EVENT_END = RendererEvent.END;

    /**
     * A list of async jobs which must be completed *before* rendering output.
     * They will be called after {@link RendererEvent.BEGIN} has fired, but before any files have been written.
     *
     * This may be used by plugins to register work that must be done to prepare output files. For example: asynchronously
     * transform markdown to HTML.
     *
     * Note: This array is cleared after calling the contained functions on each {@link Renderer.writeOutputs} call.
     */
    preRenderAsyncJobs: Array<(output: RendererEvent) => Promise<void>> = [];

    /**
     * A list of async jobs which must be completed after rendering output files but before generation is considered successful.
     * These functions will be called after all documents have been written to the filesystem.
     *
     * This may be used by plugins to register work that must be done to finalize output files. For example: asynchronously
     * generating an image referenced in a render hook.
     *
     * Note: This array is cleared after calling the contained functions on each {@link Renderer.writeOutputs} call.
     */
    postRenderAsyncJobs: Array<(output: RendererEvent) => Promise<void>> = [];

    /**
     * The output that is currently being used to render the documentation.
     * This will be set before {@link EVENT_BEGIN}.
     */
    output?: Output<MinimalDocument, {}>;

    get logger() {
        return this.application.logger;
    }

    /** @internal */
    @Option("cleanOutputDir")
    accessor cleanOutputDir!: boolean;

    constructor(readonly application: Application) {
        super();
    }

    /**
     * Define a new output that can be used to render a project to disc.
     */
    defineOutput(
        name: string,
        output: new (app: Application) => Output<MinimalDocument, {}>,
    ) {
        if (this.outputs.has(name)) {
            throw new Error(`The output "${name}" has already been defined.`);
        }
        this.outputs.set(name, output);
    }

    /**
     * Render the given project reflection to all user configured outputs.
     */
    async writeOutputs(project: ProjectReflection): Promise<void> {
        const options = this.application.options;
        const outputs: OutputOptions[] = [];

        // If the user set a shortcut option, ignore the outputs config, they probably
        // just wanted this one. It'd be nice to make this available to the markdown plugin
        // too...
        if (options.isSet("out") || options.isSet("json")) {
            if (options.getValue("out")) {
                outputs.push({
                    type: "html",
                    path: options.getValue("out"),
                });
            }
            if (options.getValue("json")) {
                outputs.push({
                    type: "json",
                    path: options.getValue("json"),
                });
            }

            if (options.isSet("outputs")) {
                this.logger.info(
                    "Ignoring 'outputs' configuration as 'out' or 'json' was specified.",
                );
            }
        } else if (options.isSet("outputs")) {
            outputs.push(...options.getValue("outputs"));
        }

        // No outputs = render html to docs in current directory
        if (!outputs.length) {
            outputs.push({
                type: "html",
                path: process.cwd() + "/docs",
            });
        }

        for (const output of outputs) {
            await this.writeOutput(project, output);
        }
    }

    /**
     * Render the given project with the provided output options.
     */
    async writeOutput(
        project: ProjectReflection,
        output: OutputOptions,
    ): Promise<void> {
        const start = Date.now();
        const event = new RendererEvent(output.path, project);

        this.trigger(RendererEvent.BEGIN, event);
        await this.runPreRenderJobs(event);

        const ctor = this.outputs.get(output.type);
        if (!ctor) {
            this.application.logger.error(
                `Skipping output "${output.type}" as it has not been defined. Ensure you have loaded the providing plugin.`,
            );
            return;
        }

        this.output = new ctor(this.application);
        await this.output.setup(this.application);
        const router = (this.output.router = this.output.buildRouter(
            output.path,
        ));
        const documents = router.getDocuments(project);

        if (documents.length > 1) {
            // We're writing more than one document, so the output path should be a directory.
            const success = await this.prepareOutputDirectory(output.path);
            if (!success) {
                await this.output.teardown(this.application);
                this.output = undefined;
                return;
            }
        }

        this.logger.verbose(`There are ${documents.length} documents to write`);

        for (const doc of documents) {
            router.setCurrentDocument(doc);

            const pageEvent = new PageEvent(project, doc);
            this.trigger(PageEvent.BEGIN, pageEvent);
            pageEvent.contents = await this.output.render(doc);
            this.trigger(PageEvent.END, pageEvent);

            try {
                writeFileSync(
                    join(output.path, doc.filename),
                    pageEvent.contents,
                );
            } catch {
                this.logger.error(`Could not write ${doc.filename}`);
            }
        }

        this.trigger(RendererEvent.END, event);
        await this.output.teardown(this.application);
        await this.runPostRenderJobs(event);

        this.logger.verbose(
            `Rendering ${output.type} took ${Date.now() - start}ms`,
        );
        this.logger.info(
            `Wrote ${output.type} output to ${nicePath(output.path)}`,
        );

        this.output = undefined;
    }

    private async runPreRenderJobs(output: RendererEvent) {
        await Promise.all(this.preRenderAsyncJobs.map((job) => job(output)));
        this.preRenderAsyncJobs = [];
    }

    private async runPostRenderJobs(output: RendererEvent) {
        await Promise.all(this.postRenderAsyncJobs.map((job) => job(output)));
        this.postRenderAsyncJobs = [];
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
                this.logger.warn("Could not empty the output directory.");
                return false;
            }
        }

        try {
            fs.mkdirSync(directory, { recursive: true });
        } catch (error) {
            this.logger.error(
                `Could not create output directory ${directory}.`,
            );
            return false;
        }

        return true;
    }
}
