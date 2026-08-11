import { AsyncLocalStorage } from "node:async_hooks";
import type { WorkspaceRole } from "@crm/auth";
import { Inject } from "@nestjs/common";

export interface ProjectContext {
	organizationId: string;
	projectId: string;
	role?: WorkspaceRole;
}

const storage = new AsyncLocalStorage<ProjectContext>();

export function runInProjectContext<T>(
	context: ProjectContext,
	fn: () => T,
): T {
	return storage.run(context, fn);
}

export function getProjectContext(): ProjectContext | undefined {
	return storage.getStore();
}

export class NoProjectInScopeError extends Error {
	constructor() {
		super(
			"No project is in scope. A project-scoped query ran outside a request that resolved one; inject DATABASE instead if the work is genuinely install-wide.",
		);
		this.name = "NoProjectInScopeError";
	}
}

let ambient: ProjectContext | null = null;

export function setProjectContextForTests(
	context: ProjectContext | null,
): void {
	if (process.env.NODE_ENV === "production") {
		throw new Error(
			"setProjectContextForTests must never run in production: it would let a query outside a request pick up a project it did not resolve.",
		);
	}

	ambient = context;
}

export function requireProjectContext(): ProjectContext {
	const context = storage.getStore() ?? ambient;

	if (!context) throw new NoProjectInScopeError();

	return context;
}

export function currentProjectId(): string {
	return requireProjectContext().projectId;
}

export function currentOrganizationId(): string {
	return requireProjectContext().organizationId;
}

export const PROJECT_DATABASE = Symbol("PROJECT_DATABASE");

export const InjectProjectDatabase = () => Inject(PROJECT_DATABASE);
