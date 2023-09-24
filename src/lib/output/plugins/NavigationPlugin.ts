import * as Path from "path";
import { RendererEvent } from "../events";
import { Bound, Plugin, writeFile } from "../../utils";
import { gzip } from "zlib";
import { promisify } from "util";
import type { Application } from "../../application";
import { HtmlOutput } from "../html-output";

const gzipP = promisify(gzip);

@Plugin("typedoc:navigationTree")
export class NavigationPlugin {
    constructor(readonly application: Application) {
        application.renderer.on(RendererEvent.BEGIN, this.onRendererBegin);
    }

    @Bound
    private onRendererBegin() {
        if (this.application.renderer.output instanceof HtmlOutput) {
            this.application.renderer.preRenderAsyncJobs.push((event) =>
                this.buildNavigationIndex(event),
            );
        }
    }

    async buildNavigationIndex(event: RendererEvent) {
        const theme = this.application.renderer.output;
        if (!(theme instanceof HtmlOutput)) return;

        const navigationJs = Path.join(
            event.outputDirectory,
            "assets",
            "navigation.js",
        );

        const nav = theme.getNavigation?.(event.project);
        if (!nav) return;
        const gz = await gzipP(Buffer.from(JSON.stringify(nav)));

        await writeFile(
            navigationJs,
            `window.navigationData = "data:application/octet-stream;base64,${gz.toString(
                "base64",
            )}"`,
        );
    }
}
