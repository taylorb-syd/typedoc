import { MinimalDocument, Output } from "./output";
import type { ProjectReflection } from "../models";
import type { Application } from "../application";

export class JsonOutput extends Output<
    MinimalDocument & { project: ProjectReflection },
    {}
> {
    constructor(private app: Application) {
        super();
    }

    override getDocuments(project: ProjectReflection) {
        return [{ filename: "", project }];
    }

    override render(document: {
        project: ProjectReflection;
    }): string | Promise<string> {
        const json = this.app.serializer.projectToObject(
            document.project,
            process.cwd(),
        );
        const pretty = this.app.options.getValue("pretty");
        return JSON.stringify(json, null, pretty ? "\t" : "");
    }
}
