import {
    Comment,
    CommentDisplayPart,
    DeclarationReflection,
    Reflection,
} from "../../../models";
import type { JSX, Options } from "../../../utils";
import type {
    HtmlOutput,
    HtmlOutputDocument,
    HtmlOutputRouter,
    HtmlRenderContext,
    HtmlRendererHooks,
} from "../../html-output";
import { defaultLayout } from "./layouts/default";
import { index } from "./partials";
import { analytics } from "./partials/analytics";
import { breadcrumb } from "./partials/breadcrumb";
import {
    commentSummary,
    commentTags,
    reflectionFlags,
} from "./partials/comment";
import { footer } from "./partials/footer";
import { header } from "./partials/header";
import { hierarchy } from "./partials/hierarchy";
import { buildRefIcons, icons } from "./partials/icon";
import { member } from "./partials/member";
import { memberDeclaration } from "./partials/member.declaration";
import { memberGetterSetter } from "./partials/member.getterSetter";
import { memberReference } from "./partials/member.reference";
import { memberSignatureBody } from "./partials/member.signature.body";
import { memberSignatureTitle } from "./partials/member.signature.title";
import { memberSignatures } from "./partials/member.signatures";
import { memberSources } from "./partials/member.sources";
import { members } from "./partials/members";
import { membersGroup } from "./partials/members.group";
import {
    sidebar,
    pageSidebar,
    navigation,
    pageNavigation,
    settings,
    sidebarLinks,
} from "./partials/navigation";
import { parameter } from "./partials/parameter";
import { toolbar } from "./partials/toolbar";
import { type } from "./partials/type";
import { typeAndParent } from "./partials/typeAndParent";
import { typeParameters } from "./partials/typeParameters";
import { indexTemplate } from "./templates";
import { reflectionTemplate } from "./templates/reflection";

function bind<F, L extends any[], R>(fn: (f: F, ...a: L) => R, first: F) {
    return (...r: L) => fn(first, ...r);
}

export class DefaultHtmlRenderContext implements HtmlRenderContext {
    private _iconsCache: JSX.Element;
    private _refIcons: typeof icons;
    protected output: HtmlOutput<never>;
    readonly router: HtmlOutputRouter;

    constructor(
        output: HtmlOutput<any>,
        readonly page: HtmlOutputDocument,
        readonly options: Options,
    ) {
        this.output = output;
        this.router = output.router;

        const { refs, cache } = buildRefIcons(icons);
        this._refIcons = refs;
        this._iconsCache = cache;
    }

    iconsCache(): JSX.Element {
        return this._iconsCache;
    }

    get icons(): Readonly<typeof icons> {
        return this._refIcons;
    }
    set icons(value: Readonly<typeof icons>) {
        const { refs, cache } = buildRefIcons(value);
        this._refIcons = refs;
        this._iconsCache = cache;
    }

    hook = (name: keyof HtmlRendererHooks) =>
        this.output.hooks.emit(name, this);

    /** Avoid this in favor of urlTo if possible */
    relativeURL = (url: string, cacheBust = false) => {
        return this.router.relativeUrl(url, cacheBust);
    };

    urlTo = (reflection: Reflection) => this.router.urlTo(reflection) || "";

    markdown = (md: readonly CommentDisplayPart[]) => {
        return this.output.parseMarkdown(
            Comment.displayPartsToMarkdown(md, this.urlTo),
        );
    };

    getNavigation = () => this.output.getNavigation(this.page.project);

    getReflectionClasses = (refl: DeclarationReflection) =>
        this.output.getReflectionClasses(refl);

    reflectionTemplate = bind(reflectionTemplate, this);
    indexTemplate = bind(indexTemplate, this);
    defaultLayout = bind(defaultLayout, this);

    analytics = bind(analytics, this);
    breadcrumb = bind(breadcrumb, this);
    commentSummary = bind(commentSummary, this);
    commentTags = bind(commentTags, this);
    reflectionFlags = bind(reflectionFlags, this);
    footer = bind(footer, this);
    header = bind(header, this);
    hierarchy = bind(hierarchy, this);
    index = bind(index, this);
    member = bind(member, this);
    memberDeclaration = bind(memberDeclaration, this);
    memberGetterSetter = bind(memberGetterSetter, this);
    memberReference = bind(memberReference, this);
    memberSignatureBody = bind(memberSignatureBody, this);
    memberSignatureTitle = bind(memberSignatureTitle, this);
    memberSignatures = bind(memberSignatures, this);
    memberSources = bind(memberSources, this);
    members = bind(members, this);
    membersGroup = bind(membersGroup, this);
    sidebar = bind(sidebar, this);
    pageSidebar = bind(pageSidebar, this);
    sidebarLinks = bind(sidebarLinks, this);
    settings = bind(settings, this);
    navigation = bind(navigation, this);
    pageNavigation = bind(pageNavigation, this);
    parameter = bind(parameter, this);
    toolbar = bind(toolbar, this);
    type = bind(type, this);
    typeAndParent = bind(typeAndParent, this);
    typeParameters = bind(typeParameters, this);
}
