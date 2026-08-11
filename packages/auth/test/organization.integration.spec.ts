import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { ensureOrganizationMembership } from "../src/organization";

const suffix = process.env.TEST_RUN_ID ?? "organization-spec";

const emailOf = (label: string) => `${label}.${suffix}@example.test`;

let firstId: string;
let secondId: string;

const seedUser = async (label: string, createdAt: Date): Promise<string> => {
	const user = await db.user.create({
		data: {
			id: `${suffix}-${label}`,
			name: label,
			email: emailOf(label),
			createdAt,
			updatedAt: createdAt,
		},
		select: { id: true },
	});

	return user.id;
};

const membershipOf = async (
	userId: string,
): Promise<{ organizationId: string; role: string } | null> => {
	const member = await db.member.findFirst({
		where: { userId },
		select: { organizationId: true, role: true },
	});

	return member;
};

const roleOf = async (userId: string): Promise<string | null> =>
	(await membershipOf(userId))?.role ?? null;

const clear = async () => {
	await db.member.deleteMany({
		where: { userId: { startsWith: `${suffix}-` } },
	});
	await db.user.deleteMany({
		where: { email: { endsWith: `.${suffix}@example.test` } },
	});

	const organizations = await db.organization.findMany({
		select: { id: true, _count: { select: { members: true } } },
	});

	for (const organization of organizations) {
		if (organization._count.members > 0) continue;

		await db.organization.delete({ where: { id: organization.id } });
	}
};

beforeEach(async () => {
	await clear();

	firstId = await seedUser("first", new Date("2020-01-01T00:00:00Z"));
	secondId = await seedUser("second", new Date("2021-01-01T00:00:00Z"));
});

afterAll(clear);

describe("ensureOrganizationMembership", () => {
	it("makes the first person an owner, with a project to work in", async () => {
		const organizationId = await ensureOrganizationMembership(firstId);

		expect(organizationId).toBeTruthy();
		expect(await roleOf(firstId)).toBe("owner");

		const projects = await db.project.count({ where: { organizationId } });
		expect(projects).toBe(1);
	});

	it("puts the next person in the same organization, as a member", async () => {
		const owner = await ensureOrganizationMembership(firstId);
		const joiner = await ensureOrganizationMembership(secondId);

		expect(joiner).toBe(owner);
		expect(await roleOf(firstId)).toBe("owner");
		expect(await roleOf(secondId)).toBe("member");
	});

	it("is idempotent, so signing in again neither duplicates nor re-roles", async () => {
		const organizationId = await ensureOrganizationMembership(firstId);
		await ensureOrganizationMembership(secondId);

		await db.member.updateMany({
			where: { organizationId, userId: secondId },
			data: { role: "admin" },
		});

		await ensureOrganizationMembership(secondId);
		await ensureOrganizationMembership(secondId);

		const rows = await db.member.findMany({
			where: { organizationId, userId: secondId },
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]?.role).toBe("admin");
	});

	it("leaves the owner alone when a later arrival signs in", async () => {
		const organizationId = await ensureOrganizationMembership(firstId);

		const laterId = await seedUser("later", new Date("2026-01-01T00:00:00Z"));
		await ensureOrganizationMembership(laterId);

		expect(await roleOf(firstId)).toBe("owner");
		expect(await roleOf(laterId)).toBe("member");

		const owners = await db.member.count({
			where: { organizationId, role: "owner" },
		});

		expect(owners).toBe(1);
	});

	it("does not create a second organization once one exists", async () => {
		await ensureOrganizationMembership(firstId);
		const before = await db.organization.count();

		await ensureOrganizationMembership(secondId);

		expect(await db.organization.count()).toBe(before);
	});
});
