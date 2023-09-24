import * as fs from "fs";
import * as Path from "path";
import * as Marked from "marked";

import { RendererEvent, MarkdownEvent, PageEvent } from "../events";
import { Option, readFile, copySync, isFile, Plugin } from "../../utils";
import {
    highlight,
    highlighterLoaded,
    isSupportedLanguage,
    loadHighlighter,
} from "../../utils/highlighter";
import type { Theme } from "shiki";
import { escapeHtml, getTextContent } from "../../utils/html";
import type { Application } from "../../application";
import { HtmlOutput, HtmlOutputDocument } from "../html-output";
import type { MinimalDocument } from "..";

/**
 * Implements markdown and relativeURL helpers for templates.
 * @internal
 */
@Plugin("typedoc:marked")
export class MarkedPlugin {
    @Option("includes")
    accessor includeSource!: string;

    @Option("media")
    accessor mediaSource!: string;

    @Option("lightHighlightTheme")
    accessor lightTheme!: Theme;

    @Option("darkHighlightTheme")
    accessor darkTheme!: Theme;

    /**
     * The path referenced files are located in.
     */
    private includes?: string;

    /**
     * Path to the output media directory.
     */
    private mediaDirectory?: string;

    /**
     * The pattern used to find references in markdown.
     */
    private includePattern = /\[\[include:([^\]]+?)\]\]/g;

    /**
     * The pattern used to find media links.
     */
    private mediaPattern = /media:\/\/([^ ")\]}]+)/g;

    private document?: HtmlOutputDocument;

    constructor(readonly application: Application) {
        application.renderer.on(PageEvent.BEGIN, this.onBeginPage.bind(this));
    }

    /**
     * Highlight the syntax of the given text using Shiki.
     *
     * @param text  The text that should be highlighted.
     * @param lang  The language that should be used to highlight the string.
     * @return A html string with syntax highlighting.
     */
    private getHighlighted(text: string, lang?: string): string {
        if (!highlighterLoaded()) {
            return text;
        }

        lang = lang || "typescript";
        lang = lang.toLowerCase();
        if (!isSupportedLanguage(lang)) {
            this.application.logger.warn(
                `Unsupported highlight language "${lang}" will not be highlighted. Run typedoc --help for a list of supported languages.`,
            );
            return text;
        }

        return highlight(text, lang);
    }

    /**
     * Ensures the syntax highlighter is loaded.
     */
    public async loadHighlighter() {
        await loadHighlighter(this.lightTheme, this.darkTheme);
    }

    /**
     * Parse the given markdown string and return the resulting html.
     *
     * @param text  The markdown string that should be parsed.
     * @returns The resulting html string.
     */
    public parseMarkdown(text: string) {
        const output = this.application.renderer.output;
        if (!(output instanceof HtmlOutput)) {
            throw new Error(
                "Markdown parsing is only available when the output type is html",
            );
        }

        if (this.includes) {
            text = text.replace(this.includePattern, (_match, path) => {
                path = Path.join(this.includes!, path.trim());
                if (isFile(path)) {
                    const contents = readFile(path);
                    const event = new MarkdownEvent(
                        this.document!,
                        contents,
                        contents,
                    );
                    output.trigger(MarkdownEvent.INCLUDE, event);
                    return event.parsedText;
                } else {
                    this.application.logger.warn(
                        "Could not find file to include: " + path,
                    );
                    return "";
                }
            });
        }

        if (this.mediaDirectory) {
            text = text.replace(
                this.mediaPattern,
                (match: string, path: string) => {
                    const fileName = Path.join(this.mediaDirectory!, path);

                    if (isFile(fileName)) {
                        return output.router.relativeUrl("media") + "/" + path;
                    } else {
                        this.application.logger.warn(
                            "Could not find media file: " + fileName,
                        );
                        return match;
                    }
                },
            );
        }

        const event = new MarkdownEvent(this.document!, text, text);

        output.trigger(MarkdownEvent.PARSE, event);
        event.parsedText = Marked.marked(event.parsedText);
        return event.parsedText;
    }

    /**
     * Triggered before the renderer starts rendering a project.
     *
     * @param event  An event object describing the current render operation.
     */
    protected onBeginRenderer(event: RendererEvent) {
        Marked.marked.setOptions(this.createMarkedOptions());

        delete this.includes;
        if (this.includeSource) {
            if (
                fs.existsSync(this.includeSource) &&
                fs.statSync(this.includeSource).isDirectory()
            ) {
                this.includes = this.includeSource;
            } else {
                this.application.logger.warn(
                    "Could not find provided includes directory: " +
                        this.includeSource,
                );
            }
        }

        if (this.mediaSource) {
            if (
                fs.existsSync(this.mediaSource) &&
                fs.statSync(this.mediaSource).isDirectory()
            ) {
                this.mediaDirectory = Path.join(event.outputDirectory, "media");
                copySync(this.mediaSource, this.mediaDirectory);
            } else {
                this.mediaDirectory = undefined;
                this.application.logger.warn(
                    "Could not find provided media directory: " +
                        this.mediaSource,
                );
            }
        }
    }

    private onBeginPage(page: PageEvent<MinimalDocument>) {
        if (page.document instanceof HtmlOutputDocument) {
            this.document = page.document;
        }
    }

    /**
     * Creates an object with options that are passed to the markdown parser.
     *
     * @returns The options object for the markdown parser.
     */
    private createMarkedOptions(): Marked.marked.MarkedOptions {
        const markedOptions = (this.application.options.getValue(
            "markedOptions",
        ) ?? {}) as Marked.marked.MarkedOptions;

        // Set some default values if they are not specified via the TypeDoc option
        markedOptions.highlight ??= (text, lang) =>
            this.getHighlighted(text, lang);

        if (!markedOptions.renderer) {
            markedOptions.renderer = new Marked.Renderer();

            markedOptions.renderer.heading = (text, level, _, slugger) => {
                const slug = slugger.slug(text);
                // Prefix the slug with an extra `md:` to prevent conflicts with TypeDoc's anchors.
                this.document!.pageHeadings.push({
                    link: `#md:${slug}`,
                    text: getTextContent(text),
                    level,
                });
                return `<a id="md:${slug}" class="tsd-anchor"></a><h${level}><a href="#md:${slug}">${text}</a></h${level}>`;
            };
            markedOptions.renderer.code = renderCode;
        }

        markedOptions.mangle ??= false; // See https://github.com/TypeStrong/typedoc/issues/1395

        return markedOptions;
    }
}

// Basically a copy/paste of Marked's code, with the addition of the button
// https://github.com/markedjs/marked/blob/v4.3.0/src/Renderer.js#L15-L39
function renderCode(
    this: Marked.marked.Renderer,
    code: string,
    info: string | undefined,
    escaped: boolean,
) {
    const lang = (info || "").match(/\S*/)![0];
    if (this.options.highlight) {
        const out = this.options.highlight(code, lang);
        if (out != null && out !== code) {
            escaped = true;
            code = out;
        }
    }

    code = code.replace(/\n$/, "") + "\n";

    if (!lang) {
        return `<pre><code>${
            escaped ? code : escapeHtml(code)
        }</code><button>Copy</button></pre>\n`;
    }

    return `<pre><code class="${this.options.langPrefix + escapeHtml(lang)}">${
        escaped ? code : escapeHtml(code)
    }</code><button>Copy</button></pre>\n`;
}
