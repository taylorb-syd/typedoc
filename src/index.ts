export { Application, type ApplicationEvents } from "./lib/application";

export { resetReflectionID } from "./lib/models/reflections/abstract";
/**
 * All symbols documented under the Models namespace are also available in the root import.
 */
export * as Models from "./lib/models";
/**
 * All symbols documented under the Configuration namespace are also available in the root import.
 */
export * as Configuration from "./lib/utils/options";
export * from "./lib/models";
export {
    Converter,
    Context,
    type ConverterEvents,
    type CommentParserConfig,
    type DeclarationReference,
    type SymbolReference,
    type ComponentPath,
    type Meaning,
    type MeaningKeyword,
    type ExternalResolveResult,
    type ExternalSymbolResolver,
} from "./lib/converter";

export {
    Renderer,
    type RendererEvents,
    DefaultHtmlOutput,
    type HtmlRenderContext,
    DefaultHtmlRenderContext,
    PageEvent,
    RendererEvent,
    MarkdownEvent,
    HtmlOutput,
    HtmlOutputDocument,
    type HtmlOutputEvents,
    HtmlOutputRouter,
    type HtmlRendererHooks,
    KindFolderHtmlOutputRouter,
    type MinimalDocument,
    type NavigationElement,
    Output,
} from "./lib/output";

export {
    ArgumentsReader,
    Option,
    CommentStyle,
    JSX,
    LogLevel,
    Logger,
    Options,
    PackageJsonReader,
    ParameterHint,
    ParameterType,
    TSConfigReader,
    TypeDocReader,
    EntryPointStrategy,
    EventHooks,
    EventDispatcher,
    MinimalSourceFile,
    normalizePath,
} from "./lib/utils";

export type {
    OptionsReader,
    TypeDocOptions,
    TypeDocPlugins,
    TypeDocOptionMap,
    ValidationOptions,
    TypeDocOptionValues,
    KeyToDeclaration,
    DeclarationOption,
    DeclarationOptionBase,
    StringDeclarationOption,
    NumberDeclarationOption,
    BooleanDeclarationOption,
    ArrayDeclarationOption,
    MixedDeclarationOption,
    ObjectDeclarationOption,
    MapDeclarationOption,
    FlagsDeclarationOption,
    DeclarationOptionToOptionType,
    SortStrategy,
    ParameterTypeToOptionTypeMap,
    DocumentationEntryPoint,
    ManuallyValidatedOption,
    EnumKeys,
    JsDocCompatibility,
} from "./lib/utils";

export {
    JSONOutput,
    Serializer,
    Deserializer,
    type Deserializable,
    type DeserializerComponent,
    type SerializerComponent,
    SerializeEvent,
} from "./lib/serialization";

import TypeScript from "typescript";
export { TypeScript };
