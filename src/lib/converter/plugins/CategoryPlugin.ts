import {
    Reflection,
    ContainerReflection,
    DeclarationReflection,
    Comment,
} from "../../models";
import { ReflectionCategory } from "../../models";
import { Converter } from "../converter";
import type { Context } from "../context";
import { Plugin, Option, getSortFunction, Bound } from "../../utils";
import type { Application } from "../../application";

/**
 * A handler that sorts and categorizes the found reflections in the resolving phase.
 *
 * The handler sets the ´category´ property of all reflections and removes the `@category`
 * tag from the comment.
 */
@Plugin("typedoc:category")
export class CategoryPlugin {
    sortFunction!: (reflections: DeclarationReflection[]) => void;

    @Option("defaultCategory")
    private accessor defaultCategory!: string;

    @Option("categoryOrder")
    private accessor categoryOrder!: string[];

    @Option("categorizeByGroup")
    private accessor categorizeByGroup!: boolean;

    @Option("searchCategoryBoosts")
    private accessor boosts!: Record<string, number>;

    private usedBoosts = new Set<string>();

    /**
     * Create a new CategoryPlugin instance.
     */
    constructor(readonly application: Application) {
        application.converter.on(Converter.EVENT_BEGIN, this.onBegin, -200);
        application.converter.on(Converter.EVENT_RESOLVE, this.onResolve, -200);
        application.converter.on(
            Converter.EVENT_RESOLVE_END,
            this.onEndResolve,
            -200,
        );
    }

    /**
     * Triggered when the converter begins converting a project.
     */
    @Bound
    private onBegin(_context: Context) {
        this.sortFunction = getSortFunction(this.application.options);
    }

    /**
     * Triggered when the converter resolves a reflection.
     *
     * @param context  The context object describing the current state the converter is in.
     * @param reflection  The reflection that is currently resolved.
     */
    @Bound
    private onResolve(_context: Context, reflection: Reflection) {
        if (reflection instanceof ContainerReflection) {
            this.categorize(reflection);
        }
    }

    /**
     * Triggered when the converter has finished resolving a project.
     *
     * @param context  The context object describing the current state the converter is in.
     */
    @Bound
    private onEndResolve(context: Context) {
        const project = context.project;
        this.categorize(project);

        const unusedBoosts = new Set(Object.keys(this.boosts));
        for (const boost of this.usedBoosts) {
            unusedBoosts.delete(boost);
        }
        this.usedBoosts.clear();

        if (unusedBoosts.size) {
            context.logger.warn(
                `Not all categories specified in searchCategoryBoosts were used in the documentation.` +
                    ` The unused categories were:\n\t${Array.from(
                        unusedBoosts,
                    ).join("\n\t")}`,
            );
        }
    }

    private categorize(obj: ContainerReflection) {
        if (this.categorizeByGroup) {
            this.groupCategorize(obj);
        } else {
            this.lumpCategorize(obj);
        }
    }

    private groupCategorize(obj: ContainerReflection) {
        if (!obj.groups || obj.groups.length === 0) {
            return;
        }
        obj.groups.forEach((group) => {
            if (group.categories) return;

            group.categories = this.getReflectionCategories(group.children);
            if (group.categories && group.categories.length > 1) {
                this.sortCategories(group.categories);
            } else if (
                group.categories.length === 1 &&
                group.categories[0].title === this.defaultCategory
            ) {
                // no categories if everything is uncategorized
                group.categories = undefined;
            }
        });
    }

    private lumpCategorize(obj: ContainerReflection) {
        if (!obj.children || obj.children.length === 0 || obj.categories) {
            return;
        }
        obj.categories = this.getReflectionCategories(obj.children);
        if (obj.categories && obj.categories.length > 1) {
            this.sortCategories(obj.categories);
        } else if (
            obj.categories.length === 1 &&
            obj.categories[0].title === this.defaultCategory
        ) {
            // no categories if everything is uncategorized
            obj.categories = undefined;
        }
    }

    /**
     * Create a categorized representation of the given list of reflections.
     *
     * @param reflections  The reflections that should be categorized.
     * @param categorySearchBoosts A user-supplied map of category titles, for computing a
     *   relevance boost to be used when searching
     * @returns An array containing all children of the given reflection categorized
     */
    private getReflectionCategories(
        reflections: DeclarationReflection[],
    ): ReflectionCategory[] {
        const categories = new Map<string, ReflectionCategory>();

        for (const child of reflections) {
            const childCategories = this.extractCategories(child);
            if (childCategories.size === 0) {
                childCategories.add(this.defaultCategory);
            }

            for (const childCat of childCategories) {
                const category = categories.get(childCat);

                if (category) {
                    category.children.push(child);
                } else {
                    const cat = new ReflectionCategory(childCat);
                    cat.children.push(child);
                    categories.set(childCat, cat);
                }
            }
        }

        for (const cat of categories.values()) {
            this.sortFunction(cat.children);
        }

        return Array.from(categories.values());
    }

    /**
     * Return the category of a given reflection.
     *
     * @param reflection The reflection.
     * @returns The category the reflection belongs to
     *
     * @privateRemarks
     * If you change this, also update getGroups in GroupPlugin accordingly.
     */
    private extractCategories(reflection: DeclarationReflection) {
        const categories = this.getCategories(reflection);

        reflection.comment?.removeTags("@category");
        for (const sig of reflection.getNonIndexSignatures()) {
            sig.comment?.removeTags("@category");
        }

        if (reflection.type?.type === "reflection") {
            reflection.type.declaration.comment?.removeTags("@category");
            for (const sig of reflection.type.declaration.getNonIndexSignatures()) {
                sig.comment?.removeTags("@category");
            }
        }

        for (const cat of categories) {
            if (cat in this.boosts) {
                this.usedBoosts.add(cat);
                reflection.relevanceBoost =
                    (reflection.relevanceBoost ?? 1) * this.boosts[cat];
            }
        }

        return categories;
    }

    private sortCategories(categories: ReflectionCategory[]): void {
        const WEIGHTS = this.categoryOrder;

        categories.sort((a, b) => {
            let aWeight = WEIGHTS.indexOf(a.title);
            let bWeight = WEIGHTS.indexOf(b.title);
            if (aWeight === -1 || bWeight === -1) {
                let asteriskIndex = WEIGHTS.indexOf("*");
                if (asteriskIndex === -1) {
                    asteriskIndex = WEIGHTS.length;
                }
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

    /**
     * Discover the `@category` tags associated with the given reflection.
     * If no `@category` tags are found, a set containing the default category
     * will be returned.
     *
     * Does _not_ remove the category tags from comments.
     */
    getCategories(reflection: DeclarationReflection) {
        const categories = new Set<string>();
        function discoverCategories(comment: Comment | undefined) {
            if (!comment) return;
            for (const tag of comment.blockTags) {
                if (tag.tag === "@category") {
                    categories.add(
                        Comment.combineDisplayParts(tag.content).trim(),
                    );
                }
            }
        }

        discoverCategories(reflection.comment);
        for (const sig of reflection.getNonIndexSignatures()) {
            discoverCategories(sig.comment);
        }

        if (reflection.type?.type === "reflection") {
            discoverCategories(reflection.type.declaration.comment);
            for (const sig of reflection.type.declaration.getNonIndexSignatures()) {
                discoverCategories(sig.comment);
            }
        }

        categories.delete("");
        if (!categories.size) {
            categories.add(this.defaultCategory);
        }

        return categories;
    }
}
