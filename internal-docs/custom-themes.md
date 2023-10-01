# Custom Themes

TypeDoc used to have the concept of a "theme" which was effectively a set of custom HTML templates used
to render docs to HTML. With TypeDoc 0.26, this has changed so that TypeDoc operates on "outputs" instead.
This rename allows more flexibility, so you could define an output to produce JSON, Markdown, or even
a PDF! It also allows users to request more than one concurrent output type.

Outputs are defined by plugins calling the `defineOutput` method on `Application.renderer` when plugins
are loaded. The most trivial output, which exactly duplicates the default HTML output can be created by
doing the following:

```ts
import { Application, DefaultHtmlOutput } from "typedoc";

export function load(app: Application) {
    app.renderer.defineOutput("custom", DefaultHtmlOutput);
}
```

This isn't very interesting since it exactly duplicates the default output. Most outputs are variations on
the default HTML output and need to adjust the templates in some way. This can be done by providing a class
which returns a different context class. Say we wanted to replace TypeDoc's default analytics helper with one
that uses [Open Web Analytics](https://www.openwebanalytics.com/) instead of Google Analytics. This could be
done with the following theme:

```tsx
import {
    Application,
    DefaultHtmlOutput,
    HtmlOutputDocument,
    DefaultHtmlRenderContext,
    PageEvent,
    JSX,
} from "typedoc";

const script = `
(function() {
    var _owa = document.createElement('script'); _owa.type = 'text/javascript';
    _owa.async = true; _owa.src = '${site}' + '/modules/base/js/owa.tracker-combined-min.js';
    var _owa_s = document.getElementsByTagName('script')[0]; _owa_s.parentNode.insertBefore(_owa,
    _owa_s);
}());
`.trim();

class MyOutputContext extends DefaultHtmlRenderContext {
    // Important: If you use `this`, this function MUST be bound! Template functions are free
    // to destructure the context object to only grab what they care about.
    override analytics = () => {
        // Reusing existing option rather than declaring our own for brevity
        if (!this.options.isSet("gaId")) return;

        const site = this.options.getValue("gaId");

        return (
            <script>
                <JSX.Raw html={script} />
            </script>
        );
    };
}

class MyOutput extends DefaultTheme {
    override getRenderContext(doc: HtmlOutputDocument) {
        return new MyOutputContext(this, doc, this.application.options);
    }
}

export function load(app: Application) {
    app.renderer.defineOutput("html:open-web-analytics", MyOutput);
}
```

## Hooks (v0.22.8+)

When rendering HTML, TypeDoc's will call several functions to allow plugins to inject HTML
into a page without completely overwriting a theme. Hooks live on output `HtmlOutput` and may be called
by child themes which overwrite a helper with a custom implementation. As an example, the following plugin
will cause a popup on every page when loaded.

```tsx
import { Application, Renderer, JSX, HtmlOutput } from "typedoc";
export function load(app: Application) {
    app.renderer.on(Renderer.EVENT_BEGIN, () => {
        const output = app.renderer.output;
        if (output instanceof HtmlOutput) {
            output.hooks.on("head.end", () => (
                <script>
                    <JSX.Raw html="alert('hi!');" />
                </script>
            ));
        }
    });
}
```

For documentation on the available hooks, see the [HtmlRendererHooks](https://typedoc.org/api/interfaces/HtmlRendererHooks.html)
documentation on the website.

## Async Jobs

Themes which completely override TypeDoc's builtin renderer may need to perform some async initialization
or teardown after rendering. To support this, there are two arrays of functions available on `Renderer`
which plugins may add a callback to. The renderer will call each function within these arrays when rendering
and await the results.

```ts
import { Application, RendererEvent } from "typedoc";
export function load(app: Application) {
    app.renderer.preRenderAsyncJobs.push(async (output: RendererEvent) => {
        app.logger.info(
            "Pre render, no docs written to " + output.outputDirectory + " yet",
        );
        // Slow down rendering by 1 second
        await new Promise((r) => setTimeout(r, 1000));
    });

    app.renderer.postRenderAsyncJobs.push(async (output: RendererEvent) => {
        app.logger.info(
            "Post render, all docs written to " + output.outputDirectory,
        );
    });
}
```
