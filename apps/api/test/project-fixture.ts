import { db } from "@crm/db";
import { projectSlug } from "@crm/db/project";
import { setProjectContextForTests } from "../src/projects/project-context";

export type TestProject = {
	organizationId: string;
	projectId: string;
};

export async function createTestProject(prefix: string): Promise<TestProject> {
	const suffix = crypto.randomUUID().slice(0, 8);
	const organizationId = `${prefix}-org-${suffix}`;

	await db.organization.create({
		data: {
			id: organizationId,
			name: prefix,
			slug: `${prefix}-${suffix}`,
			createdAt: new Date(),
		},
	});

	const project = await db.project.create({
		data: {
			organizationId,
			name: prefix,
			slug: projectSlug(`${prefix}-${suffix}`),
		},
		select: { id: true },
	});

	const context = {
		organizationId,
		projectId: project.id,
		role: "owner" as const,
	};

	setProjectContextForTests(context);

	return { organizationId, projectId: project.id };
}

export async function destroyTestProject(
	fixture: TestProject | null,
): Promise<void> {
	setProjectContextForTests(null);

	if (!fixture) return;

	await db.organization.deleteMany({ where: { id: fixture.organizationId } });
}
