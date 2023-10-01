import { RendererEvent } from "../events";
import { copySync, readFile } from "../../utils/fs";
import { getStyles } from "../../utils/highlighter";
import { Bound, Option, Plugin } from "../../utils";
import { closeSync, existsSync, openSync, writeSync } from "fs";
import { join } from "path";
import type { Application } from "../../application";
import { DefaultHtmlOutput } from "../themes/default/DefaultHtmlOutput";

/**
 * A plugin that copies the subdirectory ´assets´ from the current themes
 * source folder to the output directory.
 */
@Plugin("typedoc:assets")
export class AssetsPlugin {
    /** @internal */
    @Option("customCss")
    accessor customCss!: string;

    constructor(readonly application: Application) {
        application.renderer.on(RendererEvent.END, this.onRenderEnd);
    }

    /**
     * Triggered before the renderer starts rendering a project.
     *
     * @param event  An event object describing the current render operation.
     */
    @Bound
    private onRenderEnd(event: RendererEvent) {
        if (this.application.renderer.output instanceof DefaultHtmlOutput) {
            this.copyAssets(event.outputDirectory);
        }
    }

    public copyAssets(outputDirectory: string): void {
        const src = join(__dirname, "..", "..", "..", "..", "static");
        const dest = join(outputDirectory, "assets");
        copySync(src, dest);

        const fp = openSync(join(dest, "style.css"), "a");
        writeSync(fp, "/* Syntax Highlighting */\n\n");
        writeSync(fp, getStyles());

        if (this.customCss) {
            if (existsSync(this.customCss)) {
                writeSync(fp, "/* Custom CSS */\n\n");
                writeSync(fp, readFile(this.customCss));
            } else {
                this.application.logger.error(
                    `Custom CSS file at ${this.customCss} does not exist.`,
                );
            }
        }

        closeSync(fp);
    }
}
