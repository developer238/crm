import type { Db } from "@crm/db";
import { forProject } from "@crm/db/project";
import { requireProjectContext } from "./project-context";

export type ProjectScopedDb = Db;

type Anything = Record<string | symbol, unknown>;

export function createProjectDatabase(db: Db): ProjectScopedDb {
	const cache = new Map<string, Anything>();

	const scoped = (): Anything => {
		const { projectId } = requireProjectContext();

		const existing = cache.get(projectId);
		if (existing) return existing;

		const created = forProject(db, projectId) as unknown as Anything;
		cache.set(projectId, created);

		return created;
	};

	const member = (key: string | symbol) =>
		new Proxy(function noop() {} as unknown as Anything, {
			apply(_target, _thisArg, args: unknown[]) {
				const client = scoped();
				const value = client[key];

				if (typeof value !== "function") {
					throw new TypeError(`db.${String(key)} is not callable.`);
				}

				return (value as (...input: unknown[]) => unknown).apply(client, args);
			},
			get(_target, method) {
				return (...args: unknown[]) => {
					const client = scoped();
					const namespace = client[key] as Anything;
					const fn = namespace?.[method];

					if (typeof fn !== "function") {
						throw new TypeError(
							`db.${String(key)}.${String(method)} is not callable.`,
						);
					}

					return (fn as (...input: unknown[]) => unknown).apply(
						namespace,
						args,
					);
				};
			},
		});

	const members = new Map<string | symbol, Anything>();

	return new Proxy({} as Anything, {
		get(_target, key) {
			if (!(key in (db as unknown as Anything))) return undefined;

			const cached = members.get(key);
			if (cached) return cached;

			const created = member(key);
			members.set(key, created);

			return created;
		},
		has(_target, key) {
			return key in (db as unknown as Anything);
		},
	}) as unknown as ProjectScopedDb;
}
