import { MinimalDocument, Output, Router } from "./output";
import type { ProjectReflection } from "../models";
import type { Application } from "../application";

export interface JsonOutputDocument extends MinimalDocument {
    model: ProjectReflection;
}

// It's somewhat silly to have a router for one document, but requiring one
// makes the renderer simpler.
export class JsonOutputRouter extends Router<JsonOutputDocument> {
    override getDocuments(project: ProjectReflection) {
        return [{ filename: "", model: project }];
    }
}

export class JsonOutput extends Output<MinimalDocument, {}> {
    constructor(private app: Application) {
        super();
    }

    override buildRouter(basePath: string): JsonOutputRouter {
        return new JsonOutputRouter(basePath);
    }

    override render(document: JsonOutputDocument): string | Promise<string> {
        const json = this.app.serializer.projectToObject(
            document.model,
            document.filename,
        );
        const pretty = this.app.options.getValue("pretty");
        return JSON.stringify(json, null, pretty ? "\t" : "");
    }
}
