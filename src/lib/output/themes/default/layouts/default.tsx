import { JSX, Raw } from "../../../../utils";
import type { HtmlOutputDocument } from "../../../html-output";
import { getDisplayName } from "../../lib";
import type { DefaultHtmlRenderContext } from "../DefaultHtmlRenderContext";

export const defaultLayout = (
    context: DefaultHtmlRenderContext,
    template: (props: HtmlOutputDocument) => JSX.Element,
    props: HtmlOutputDocument,
) => (
    <html class="default" lang={context.options.getValue("htmlLang")}>
        <head>
            <meta charSet="utf-8" />
            {context.hook("head.begin")}
            <meta http-equiv="x-ua-compatible" content="IE=edge" />
            <title>
                {props.model.isProject()
                    ? getDisplayName(props.model)
                    : `${getDisplayName(props.model)} | ${getDisplayName(props.project)}`}
            </title>
            <meta name="description" content={"Documentation for " + props.project.name} />
            <meta name="viewport" content="width=device-width, initial-scale=1" />

            <link rel="stylesheet" href={context.relativeURL("assets/style.css", true)} />
            <script defer src={context.relativeURL("assets/main.js", true)}></script>
            <script async src={context.relativeURL("assets/search.js", true)} id="tsd-search-script"></script>
            <script async src={context.relativeURL("assets/navigation.js", true)} id="tsd-nav-script"></script>
            {context.hook("head.end")}
        </head>
        <body>
            {context.hook("body.begin")}
            <script>
                <Raw html='document.documentElement.dataset.theme = localStorage.getItem("tsd-theme") || "os"' />
            </script>
            {context.toolbar(props)}

            <div class="container container-main">
                <div class="col-content">
                    {context.hook("content.begin")}
                    {context.header(props)}
                    {template(props)}
                    {context.hook("content.end")}
                </div>
                <div class="col-sidebar">
                    <div class="page-menu">
                        {context.hook("pageSidebar.begin")}
                        {context.pageSidebar(props)}
                        {context.hook("pageSidebar.end")}
                    </div>
                    <div class="site-menu">
                        {context.hook("sidebar.begin")}
                        {context.sidebar(props)}
                        {context.hook("sidebar.end")}
                    </div>
                </div>
            </div>

            {context.footer()}

            <div class="overlay"></div>

            {context.analytics()}
            {context.iconsCache()}
            {context.hook("body.end")}
        </body>
    </html>
);
