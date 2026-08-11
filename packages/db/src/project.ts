import type { Db } from "./client";
import type { WorkspaceProfileSections } from "./json";

export const DEFAULT_PROJECT_NAME = "Default";

export const DEFAULT_PROJECT_SLUG = "default";

export const MAX_SLUG = 48;

export const RESERVED_SLUGS: readonly string[] = [
	"_next",
	"api",
	"agent",
	"agents",
	"chat",
	"companies",
	"contacts",
	"deals",
	"eve",
	"grant-access",
	"onboarding",
	"projects",
	"settings",
	"sign-in",
];

export function projectSlug(name: string): string {
	const base = name
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.slice(0, MAX_SLUG)
		.replace(/^-+|-+$/g, "");

	if (!base) return DEFAULT_PROJECT_SLUG;

	return RESERVED_SLUGS.includes(base) ? `${base}-crm` : base;
}

export const PROJECT_SCOPED_MODELS: ReadonlySet<string> = new Set([
	"Company",
	"CompanyEnrichment",
	"Contact",
	"ContactFact",
	"ContactBrief",
	"AgentTask",
	"AgentEvent",
	"AgentConversation",
	"AgentConversationFeedback",
	"AgentConversationShare",
	"AgentConversationSubmission",
	"AgentConversationAttachment",
	"AgentDefinition",
	"AgentVersion",
	"AgentBuilderArtifact",
	"AgentTrigger",
	"AgentRun",
	"AgentRunEvent",
	"AgentAction",
	"AgentAuditEvent",
	"Deal",
	"DealContact",
	"FieldDefinition",
	"FieldOption",
	"FieldValue",
	"Activity",
	"EmailThread",
	"EmailMessage",
	"CalendarEvent",
	"CalendarAttendee",
	"SuppressedDomain",
	"SuppressedContact",
	"AppSetting",
	"ProjectProfile",
]);

const WHERE_OPERATIONS = new Set([
	"findUnique",
	"findUniqueOrThrow",
	"findFirst",
	"findFirstOrThrow",
	"findMany",
	"update",
	"updateMany",
	"delete",
	"deleteMany",
	"count",
	"aggregate",
	"groupBy",
]);

const CREATE_OPERATIONS = new Set([
	"create",
	"createMany",
	"createManyAndReturn",
]);

export class UnscopedQueryError extends Error {
	constructor(model: string, operation: string) {
		super(
			`${model}.${operation} was reached without a project. Every query against a project-scoped model must go through forProject(db, projectId).`,
		);
		this.name = "UnscopedQueryError";
	}
}

function scopeWhere(
	where: unknown,
	projectId: string,
): Record<string, unknown> {
	const current =
		typeof where === "object" && where !== null
			? (where as Record<string, unknown>)
			: {};

	return { ...current, projectId };
}

function scopeData(data: unknown, projectId: string): unknown {
	if (Array.isArray(data)) {
		return data.map((row: unknown) => scopeData(row, projectId));
	}

	const current =
		typeof data === "object" && data !== null
			? (data as Record<string, unknown>)
			: {};

	return { ...current, projectId };
}

export function forProject(db: Db, projectId: string) {
	if (!projectId) throw new UnscopedQueryError("*", "*");

	return db.$extends({
		query: {
			$allModels: {
				$allOperations({ model, operation, args, query }) {
					if (!PROJECT_SCOPED_MODELS.has(model)) return query(args);

					const next =
						typeof args === "object" && args !== null
							? ({ ...args } as Record<string, unknown>)
							: ({} as Record<string, unknown>);

					if (WHERE_OPERATIONS.has(operation)) {
						next.where = scopeWhere(next.where, projectId);
						return query(next);
					}

					if (CREATE_OPERATIONS.has(operation)) {
						next.data = scopeData(next.data, projectId);
						return query(next);
					}

					if (operation === "upsert") {
						next.where = scopeWhere(next.where, projectId);
						next.create = scopeData(next.create, projectId);
						return query(next);
					}

					throw new UnscopedQueryError(model, operation);
				},
			},
		},
	});
}

export type ProjectDb = ReturnType<typeof forProject>;

export const MAX_NARRATIVE = 320;

export const MAX_LINE = 140;

export function isOnboarded(metadata: string | null): boolean {
	return typeof readMetadata(metadata).onboardedAt === "string";
}

export function markOnboarded(metadata: string | null, at: Date): string {
	const current = readMetadata(metadata);

	return JSON.stringify(
		typeof current.onboardedAt === "string"
			? current
			: { ...current, onboardedAt: at.toISOString() },
	);
}

function readMetadata(metadata: string | null): Record<string, unknown> {
	if (!metadata) return {};

	try {
		const parsed: unknown = JSON.parse(metadata);

		return typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export type ProjectProfile = {
	website: string;
	narrative: string;
	sections: WorkspaceProfileSections;
	sourceUrl: string | null;
	refreshedAt: Date;
};

export type ProjectIdentity = {
	name: string;
	website: string | null;
	profile: ProjectProfile | null;
};

export async function readProjectProfile(
	db: ProjectDb,
): Promise<ProjectProfile | null> {
	const row = await db.projectProfile.findFirst({
		select: {
			website: true,
			narrative: true,
			sections: true,
			sourceUrl: true,
			refreshedAt: true,
		},
	});

	if (!row) return null;

	return { ...row, sections: readSections(row.sections) };
}

export function websiteUrl(website: string | null | undefined): string | null {
	const trimmed = website?.trim();
	if (!trimmed) return null;

	const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed)?.[1];
	if (scheme && !/^https?$/i.test(scheme)) return null;

	let url: URL;
	try {
		url = new URL(scheme ? trimmed : `https://${trimmed}`);
	} catch {
		return null;
	}

	if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(url.hostname)) return null;

	const path = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");

	return `${url.protocol}//${url.hostname}${path}`;
}

export function profileOf(
	profile: ProjectProfile | null,
	website: string | null,
): ProjectProfile | null {
	if (!profile || !website || profile.website !== website) return null;

	return profile;
}

export async function readProjectIdentity(
	db: Db,
	projectId: string,
): Promise<ProjectIdentity | null> {
	const scoped = forProject(db, projectId);

	const [project, profile] = await Promise.all([
		db.project.findUnique({
			where: { id: projectId },
			select: { name: true, website: true },
		}),
		readProjectProfile(scoped),
	]);

	if (!project) return null;

	return {
		name: project.name,
		website: project.website,
		profile: profileOf(profile, project.website),
	};
}

export async function writeProjectProfile(
	db: ProjectDb,
	projectId: string,
	input: {
		website: string;
		narrative: string;
		sections: WorkspaceProfileSections;
		sourceUrl?: string | null;
		sessionId?: string | null;
	},
): Promise<ProjectProfile> {
	const fields = {
		website: input.website,
		narrative: clamp(input.narrative, MAX_NARRATIVE) ?? "",
		sections: trimSections(input.sections),
		sourceUrl: input.sourceUrl ?? null,
		sessionId: input.sessionId ?? null,
		refreshedAt: new Date(),
	};

	const row = await db.projectProfile.upsert({
		where: { projectId },
		create: { projectId, ...fields },
		update: fields,
		select: {
			website: true,
			narrative: true,
			sections: true,
			sourceUrl: true,
			refreshedAt: true,
		},
	});

	return { ...row, sections: readSections(row.sections) };
}

export function trimSections(
	sections: WorkspaceProfileSections,
): WorkspaceProfileSections {
	const trimmed: WorkspaceProfileSections = {};

	const sells = clamp(sections.sells, MAX_LINE);
	if (sells) trimmed.sells = sells;

	const sellsTo = clamp(sections.sellsTo, MAX_LINE);
	if (sellsTo) trimmed.sellsTo = sellsTo;

	const edge = clamp(sections.edge, MAX_LINE);
	if (edge) trimmed.edge = edge;

	return trimmed;
}

function clamp(value: string | undefined, max: number): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;

	return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function readSections(value: unknown): WorkspaceProfileSections {
	if (typeof value !== "object" || value === null) return {};

	const record = value as Record<string, unknown>;
	const text = (key: string) =>
		typeof record[key] === "string" && record[key].trim()
			? record[key].trim()
			: undefined;

	return trimSections({
		sells: text("sells"),
		sellsTo: text("sellsTo"),
		edge: text("edge"),
	});
}
