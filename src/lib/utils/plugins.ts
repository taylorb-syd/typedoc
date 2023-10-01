import { isAbsolute } from "path";
import { pathToFileURL } from "url";

import type { Application } from "../application";
import { nicePath } from "./paths";
import type { DeclarationReflection } from "../models";
import type { RendererEvent } from "../output";

const plugins: { name: string; ctor: new (app: Application) => object }[] = [];

/**
 * Describes the exports available from TypeDoc's internal plugins.
 * If you need properties/methods not currently described by this object, please open an issue,
 * but you can go ahead and use it anyways at your own risk.
 */
export interface TypeDocPlugins {
    "typedoc:category": {
        /** Discovers `@category` tags associated with the provided reflection. */
        getCategories(reflection: DeclarationReflection): Set<string>;
    };
    "typedoc:group": {};
    "typedoc:comment": {};
    "typedoc:implements": {};
    "typedoc:inheritDoc": {};
    "typedoc:linkResolver": {};
    "typedoc:package": {};
    "typedoc:sources": {};
    "typedoc:type": {};

    "typedoc:marked": {
        /**
         * If overwriting the default theme, and you want TypeDoc to perform highlighting,
         * this method must be called before rendering pages.
         */
        loadHighlighter(): Promise<void>;
        /**
         * Parse markdown, emitting events on the {@link Renderer} as appropriate.
         * Returns the resulting HTML string.
         */
        parseMarkdown(text: string): string;
    };

    "typedoc:assets": {
        /**
         * Copies TypeDoc's main.js and style.css files to the specified output directory.
         * User specified custom CSS and syntax highlighting styles may be appended to style.css
         * if specified/enabled respectively.
         *
         * If your custom theme is derived from {@link DefaultHtmlOutput}, this will happen automatically.
         */
        copyAssets(outputDirectory: string): void;
    };

    "typedoc:searchIndex": {
        /**
         * Writes search.js to the output directory. If your theme inherits from {@link DefaultHtmlOutput}
         * then this will happen automatically.
         */
        buildSearchIndex(event: RendererEvent): Promise<void>;
    };

    "typedoc:navigationTree": {
        /**
         * Writes navigation.js to the output directory. If your theme inherits from {@link DefaultHtmlOutput}
         * then this will happen automatically.
         */
        buildNavigationIndex(event: RendererEvent): Promise<void>;
    };
}

export function Plugin<K extends keyof TypeDocPlugins>(name: K) {
    return (
        ctor: new (app: Application) => TypeDocPlugins[K],
        _context: ClassDecoratorContext<
            new (app: Application) => TypeDocPlugins[K]
        >,
    ) => {
        plugins.push({ name, ctor });
    };
}

export function addInternalPlugins(app: Application) {
    for (const { name, ctor } of plugins) {
        app.setPluginExports(name as never, new ctor(app) as never);
    }
}

export async function loadPlugins(
    app: Application,
    plugins: readonly string[],
) {
    for (const plugin of plugins) {
        const pluginDisplay = getPluginDisplayName(plugin);

        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            let instance: any;
            try {
                instance = require(plugin);
            } catch (error: any) {
                if (error.code === "ERR_REQUIRE_ESM") {
                    // On Windows, we need to ensure this path is a file path.
                    // Or we'll get ERR_UNSUPPORTED_ESM_URL_SCHEME
                    const esmPath = isAbsolute(plugin)
                        ? pathToFileURL(plugin).toString()
                        : plugin;
                    instance = await import(esmPath);
                } else {
                    throw error;
                }
            }
            const initFunction = instance.load;

            if (typeof initFunction === "function") {
                await initFunction(app);
                app.logger.info(`Loaded plugin ${pluginDisplay}`);
            } else {
                app.logger.error(
                    `Invalid structure in plugin ${pluginDisplay}, no load function found.`,
                );
            }
        } catch (error) {
            app.logger.error(
                `The plugin ${pluginDisplay} could not be loaded.`,
            );
            if (error instanceof Error && error.stack) {
                app.logger.error(error.stack);
            }
        }
    }
}

function getPluginDisplayName(plugin: string) {
    const path = nicePath(plugin);
    if (path.startsWith("./node_modules/")) {
        return path.substring("./node_modules/".length);
    }
    return plugin;
}
