import { afterAll, beforeAll, expect, test } from "bun:test";
import { db } from "../src/client";
import { forProject, projectSlug, UnscopedQueryError } from "../src/project";

const suffix = process.hrtime.bigint().toString(36);

const organizationId = `iso-org-${suffix}`;

let projectA = "";
let projectB = "";

beforeAll(async () => {
	await db.organization.create({
		data: {
			id: organizationId,
			name: `Isolation ${suffix}`,
			slug: `isolation-${suffix}`,
			createdAt: new Date(),
		},
	});

	const [a, b] = await Promise.all([
		db.project.create({
			data: {
				organizationId,
				name: "Alpha",
				slug: projectSlug(`alpha-${suffix}`),
			},
			select: { id: true },
		}),
		db.project.create({
			data: {
				organizationId,
				name: "Beta",
				slug: projectSlug(`beta-${suffix}`),
			},
			select: { id: true },
		}),
	]);

	projectA = a.id;
	projectB = b.id;
});

afterAll(async () => {
	await db.organization.deleteMany({ where: { id: organizationId } });
});

test("the same domain can exist in two projects", async () => {
	const a = forProject(db, projectA);
	const b = forProject(db, projectB);

	const inA = await a.company.create({
		data: { name: "Acme", domain: "acme.example" },
		select: { id: true, projectId: true },
	});
	const inB = await b.company.create({
		data: { name: "Acme", domain: "acme.example" },
		select: { id: true, projectId: true },
	});

	expect(inA.projectId).toBe(projectA);
	expect(inB.projectId).toBe(projectB);
	expect(inA.id).not.toBe(inB.id);
});

test("a scoped read never returns another project's rows", async () => {
	const a = forProject(db, projectA);
	const b = forProject(db, projectB);

	const rows = await a.company.findMany({ select: { projectId: true } });

	expect(rows.length).toBeGreaterThan(0);
	expect(rows.every((row) => row.projectId === projectA)).toBe(true);

	const bRows = await b.company.findMany({ select: { projectId: true } });
	expect(bRows.every((row) => row.projectId === projectB)).toBe(true);
});

test("findUnique by id cannot reach across projects", async () => {
	const a = forProject(db, projectA);
	const b = forProject(db, projectB);

	const mine = await a.company.findFirst({ select: { id: true } });
	expect(mine).not.toBeNull();

	const stolen = await b.company.findUnique({
		where: { id: mine?.id ?? "" },
		select: { id: true },
	});

	expect(stolen).toBeNull();
});

test("update cannot reach across projects", async () => {
	const a = forProject(db, projectA);
	const b = forProject(db, projectB);

	const mine = await a.company.findFirst({ select: { id: true } });

	const moved = await b.company.updateMany({
		where: { id: mine?.id ?? "" },
		data: { name: "Taken" },
	});

	expect(moved.count).toBe(0);
});

test("delete cannot reach across projects", async () => {
	const a = forProject(db, projectA);
	const b = forProject(db, projectB);

	const mine = await a.company.findFirst({ select: { id: true } });

	const removed = await b.company.deleteMany({ where: { id: mine?.id ?? "" } });

	expect(removed.count).toBe(0);

	const survivor = await a.company.findUnique({
		where: { id: mine?.id ?? "" },
		select: { id: true },
	});
	expect(survivor).not.toBeNull();
});

test("an unscoped model is left alone", async () => {
	const a = forProject(db, projectA);

	const user = await a.user.findMany({ take: 1 });

	expect(Array.isArray(user)).toBe(true);
});

test("forProject refuses an empty project id", () => {
	expect(() => forProject(db, "")).toThrow(UnscopedQueryError);
});
