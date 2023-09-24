import {
    Reflection,
    ReflectionKind,
    ContainerReflection,
    DeclarationReflection,
} from "../../models/reflections/index";
import { ReflectionGroup } from "../../models/ReflectionGroup";
import { Converter } from "../converter";
import type { Context } from "../context";
import { getSortFunction } from "../../utils/sort";
import { Bound, Option, Plugin, removeIf } from "../../utils";
import { Comment } from "../../models";
import type { Application } from "../../application";

/**
 * A handler that sorts and groups the found reflections in the resolving phase.
 *
 * The handler sets the `groups` property of all container reflections.
 */
@Plugin("typedoc:group")
export class GroupPlugin {
    private sortFunction!: (reflections: DeclarationReflection[]) => void;

    @Option("searchGroupBoosts")
    private accessor boosts!: Record<string, number>;

    @Option("groupOrder")
    private accessor groupOrder!: string[];

    private usedBoosts = new Set<string>();

    constructor(readonly application: Application) {
        application.converter.on(Converter.EVENT_RESOLVE_BEGIN, () => {
            this.sortFunction = getSortFunction(this.application.options);
        });
        application.converter.on(Converter.EVENT_RESOLVE, this.onResolve);
        application.converter.on(
            Converter.EVENT_RESOLVE_END,
            this.onEndResolve,
        );
    }

    @Bound
    private onResolve(_context: Context, reflection: Reflection) {
        if (reflection instanceof ContainerReflection) {
            this.group(reflection);
        }
    }

    @Bound
    private onEndResolve(context: Context) {
        this.group(context.project);

        const unusedBoosts = new Set(Object.keys(this.boosts));
        for (const boost of this.usedBoosts) {
            unusedBoosts.delete(boost);
        }
        this.usedBoosts.clear();

        if (
            unusedBoosts.size &&
            this.application.options.isSet("searchGroupBoosts")
        ) {
            context.logger.warn(
                `Not all groups specified in searchGroupBoosts were used in the documentation.` +
                    ` The unused groups were:\n\t${Array.from(
                        unusedBoosts,
                    ).join("\n\t")}`,
            );
        }
    }

    private group(reflection: ContainerReflection) {
        if (
            reflection.children &&
            reflection.children.length > 0 &&
            !reflection.groups
        ) {
            this.sortFunction(reflection.children);
            reflection.groups = this.getReflectionGroups(reflection.children);
        }
    }

    /**
     * @privateRemarks
     * If you change this, also update extractCategories in CategoryPlugin accordingly.
     */
    private getGroups(reflection: DeclarationReflection) {
        const groups = new Set<string>();
        function extractGroupTags(comment: Comment | undefined) {
            if (!comment) return;
            removeIf(comment.blockTags, (tag) => {
                if (tag.tag === "@group") {
                    groups.add(Comment.combineDisplayParts(tag.content).trim());

                    return true;
                }
                return false;
            });
        }

        extractGroupTags(reflection.comment);
        for (const sig of reflection.getNonIndexSignatures()) {
            extractGroupTags(sig.comment);
        }

        if (reflection.type?.type === "reflection") {
            extractGroupTags(reflection.type.declaration.comment);
            for (const sig of reflection.type.declaration.getNonIndexSignatures()) {
                extractGroupTags(sig.comment);
            }
        }

        groups.delete("");
        if (groups.size === 0) {
            groups.add(ReflectionKind.pluralString(reflection.kind));
        }

        for (const group of groups) {
            if (group in this.boosts) {
                this.usedBoosts.add(group);
                reflection.relevanceBoost =
                    (reflection.relevanceBoost ?? 1) * this.boosts[group];
            }
        }

        return groups;
    }

    private getReflectionGroups(
        reflections: DeclarationReflection[],
    ): ReflectionGroup[] {
        const groups = new Map<string, ReflectionGroup>();

        reflections.forEach((child) => {
            for (const name of this.getGroups(child)) {
                let group = groups.get(name);
                if (!group) {
                    group = new ReflectionGroup(name, child);
                    groups.set(name, group);
                }

                group.children.push(child);
            }
        });

        return this.sortGroups(Array.from(groups.values()));
    }

    private sortGroups(groups: ReflectionGroup[]) {
        const WEIGHTS = this.groupOrder;
        let asteriskIndex = WEIGHTS.indexOf("*");
        if (asteriskIndex === -1) asteriskIndex = WEIGHTS.length;

        return groups.sort((a, b) => {
            let aWeight = WEIGHTS.indexOf(a.title);
            let bWeight = WEIGHTS.indexOf(b.title);
            if (aWeight === -1 || bWeight === -1) {
                if (aWeight === -1) {
                    aWeight = asteriskIndex;
                }
                if (bWeight === -1) {
                    bWeight = asteriskIndex;
                }
            }
            if (aWeight === bWeight) {
                return a.title > b.title ? 1 : -1;
            }
            return aWeight - bWeight;
        });
    }
}
