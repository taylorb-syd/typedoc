import type { Context, ExternalResolveResult } from "../../converter";
import { ConverterEvents } from "../converter-events";
import { Bound, Option, Plugin, ValidationOptions } from "../../utils";
import { DeclarationReflection, ProjectReflection } from "../../models";
import { discoverAllReferenceTypes } from "../../utils/reflections";
import { ApplicationEvents } from "../../application-events";
import type { Application } from "../../application";

/**
 * A plugin that resolves `{@link Foo}` tags.
 */
@Plugin("typedoc:linkResolver")
export class LinkResolverPlugin {
    @Option("validation")
    accessor validation!: ValidationOptions;

    constructor(readonly application: Application) {
        application.converter.on(
            ConverterEvents.RESOLVE_END,
            this.onResolve,
            -300,
        );
        this.application.on(ApplicationEvents.REVIVE, this.resolveLinks, -300);
    }

    @Bound
    onResolve(context: Context) {
        this.resolveLinks(context.project);
    }

    @Bound
    resolveLinks(project: ProjectReflection) {
        for (const id in project.reflections) {
            const reflection = project.reflections[id];
            if (reflection.comment) {
                this.application.converter.resolveLinks(
                    reflection.comment,
                    reflection,
                );
            }

            if (
                reflection instanceof DeclarationReflection &&
                reflection.readme
            ) {
                reflection.readme = this.application.converter.resolveLinks(
                    reflection.readme,
                    reflection,
                );
            }
        }

        if (project.readme) {
            project.readme = this.application.converter.resolveLinks(
                project.readme,
                project,
            );
        }

        for (const { type, owner } of discoverAllReferenceTypes(
            project,
            false,
        )) {
            if (!type.reflection) {
                const resolveResult =
                    this.application.converter.resolveExternalLink(
                        type.toDeclarationReference(),
                        owner,
                        undefined,
                        type.symbolId,
                    );
                switch (typeof resolveResult) {
                    case "string":
                        type.externalUrl = resolveResult as string;
                        break;
                    case "object":
                        type.externalUrl = (
                            resolveResult as ExternalResolveResult
                        ).target;
                        break;
                }
            }
        }
    }
}
