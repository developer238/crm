import { db } from "@crm/db";
import {
	DEFAULT_PROJECT_NAME,
	projectSlug,
	RESERVED_SLUGS,
} from "@crm/db/project";

export const DEFAULT_ORGANIZATION_NAME = "CRM";

export const WORKSPACE_ROLES = ["owner", "admin", "member"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export function isWorkspaceRole(value: string): value is WorkspaceRole {
	return (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export function isWorkspaceAdmin(role: WorkspaceRole | null): boolean {
	return role === "owner" || role === "admin";
}

export function canRenameWorkspace(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canChangeRole(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canManageCurrency(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function canManageProjects(role: WorkspaceRole | null): boolean {
	return isWorkspaceAdmin(role);
}

export function organizationSlug(name: string): string {
	const base = name
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.slice(0, 48)
		.replace(/^-+|-+$/g, "");

	if (!base) return "org";

	return RESERVED_SLUGS.includes(base) ? `${base}-crm` : base;
}

export async function ensureOrganizationMembership(
	userId: string,
): Promise<string | undefined> {
	try {
		return await db.$transaction(async (tx) => {
			const existing = await tx.member.findFirst({
				where: { userId },
				orderBy: { createdAt: "asc" },
				select: { organizationId: true },
			});

			if (existing) return existing.organizationId;

			const anyOrganization = await tx.organization.findFirst({
				orderBy: { createdAt: "asc" },
				select: { id: true },
			});

			const organizationId = anyOrganization
				? anyOrganization.id
				: await createOrganization(tx);

			const enrolled = await tx.member.count({ where: { organizationId } });

			await tx.member.create({
				data: {
					id: crypto.randomUUID(),
					organizationId,
					userId,
					role: enrolled === 0 ? "owner" : "member",
					createdAt: new Date(),
				},
			});

			return organizationId;
		});
	} catch (error) {
		console.error(
			`[auth] could not enrol user ${userId} in an organization; the next sign-in will retry`,
			error,
		);
		return undefined;
	}
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function createOrganization(tx: Tx): Promise<string> {
	const organization = await tx.organization.create({
		data: {
			id: crypto.randomUUID(),
			name: DEFAULT_ORGANIZATION_NAME,
			slug: organizationSlug(DEFAULT_ORGANIZATION_NAME),
			createdAt: new Date(),
		},
		select: { id: true },
	});

	await tx.project.create({
		data: {
			organizationId: organization.id,
			name: DEFAULT_PROJECT_NAME,
			slug: projectSlug(DEFAULT_PROJECT_NAME),
		},
	});

	return organization.id;
}
