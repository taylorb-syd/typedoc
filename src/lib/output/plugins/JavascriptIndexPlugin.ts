import * as Path from "path";
import { Builder, trimmer } from "lunr";

import {
    Comment,
    DeclarationReflection,
    ProjectReflection,
} from "../../models";
import { RendererEvent } from "../events";
import { Option, Plugin, writeFile } from "../../utils";
import { gzip } from "zlib";
import { promisify } from "util";
import type { Application } from "../../application";
import { HtmlOutput } from "../html-output";
import { DefaultHtmlOutput } from "../themes/default/DefaultHtmlOutput";

const gzipP = promisify(gzip);

/**
 * Keep this in sync with the interface in src/lib/output/themes/default/assets/typedoc/components/Search.ts
 */
interface SearchDocument {
    kind: number;
    name: string;
    url: string;
    classes?: string;
    parent?: string;
}

/**
 * A plugin that exports an index of the project to a javascript file.
 *
 * The resulting javascript file can be used to build a simple search function.
 */
@Plugin("typedoc:searchIndex")
export class JavascriptIndexPlugin {
    @Option("searchInComments")
    accessor searchComments!: boolean;

    /**
     * Create a new JavascriptIndexPlugin instance.
     */
    constructor(readonly application: Application) {
        application.renderer.on(
            RendererEvent.BEGIN,
            this.onRendererBegin.bind(this),
        );
    }

    /**
     * Triggered after a document has been rendered, just before it is written to disc.
     *
     * @param event  An event object describing the current render operation.
     */
    private onRendererBegin() {
        if (this.application.renderer.output instanceof DefaultHtmlOutput) {
            this.application.renderer.preRenderAsyncJobs.push((event) =>
                this.buildSearchIndex(event),
            );
        }
    }

    async buildSearchIndex(event: RendererEvent) {
        const output = this.application.renderer.output;
        if (!(output instanceof HtmlOutput)) return;

        const rows: SearchDocument[] = [];

        const initialSearchResults = Object.values(
            event.project.reflections,
        ).filter((refl) => {
            return (
                refl instanceof DeclarationReflection &&
                refl.url &&
                refl.name &&
                !refl.flags.isExternal
            );
        }) as DeclarationReflection[];

        const builder = new Builder();
        builder.pipeline.add(trimmer);

        builder.ref("id");
        builder.field("name", { boost: 10 });
        builder.field("comment", { boost: 10 });

        for (const reflection of initialSearchResults) {
            if (!reflection.url) {
                continue;
            }

            const boost = reflection.relevanceBoost ?? 1;
            if (boost <= 0) {
                continue;
            }

            let parent = reflection.parent;
            if (parent instanceof ProjectReflection) {
                parent = undefined;
            }

            const row: SearchDocument = {
                kind: reflection.kind,
                name: reflection.name,
                url: reflection.url,
                classes: output.getReflectionClasses?.(reflection),
            };

            if (parent) {
                row.parent = parent.getFullName();
            }

            builder.add(
                {
                    name: reflection.name,
                    comment: this.getCommentSearchText(reflection),
                    id: rows.length,
                },
                { boost },
            );
            rows.push(row);
        }

        const index = builder.build();

        const jsonFileName = Path.join(
            event.outputDirectory,
            "assets",
            "search.js",
        );

        const jsonData = JSON.stringify({
            rows,
            index,
        });
        const data = await gzipP(Buffer.from(jsonData));

        await writeFile(
            jsonFileName,
            `window.searchData = "data:application/octet-stream;base64,${data.toString(
                "base64",
            )}";`,
        );
    }

    private getCommentSearchText(reflection: DeclarationReflection) {
        if (!this.searchComments) return;

        const comments: Comment[] = [];
        if (reflection.comment) comments.push(reflection.comment);
        reflection.signatures?.forEach(
            (s) => s.comment && comments.push(s.comment),
        );
        reflection.getSignature?.comment &&
            comments.push(reflection.getSignature.comment);
        reflection.setSignature?.comment &&
            comments.push(reflection.setSignature.comment);

        if (!comments.length) {
            return;
        }

        return comments
            .flatMap((c) => {
                return [...c.summary, ...c.blockTags.flatMap((t) => t.content)];
            })
            .map((part) => part.text)
            .join("\n");
    }
}
