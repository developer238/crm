import { AsyncLocalStorage } from "node:async_hooks";
import { bumpCounter, COUNTERS } from "@crm/telemetry";
import { defineState } from "eve/context";

export const focus = defineState("crm.focus", () => ({
	projectId: null as string | null,
	contactId: null as string | null,
	companyId: null as string | null,
	sessionId: null as string | null,
	spent: 0,
	budget: 4,
	exhausted: false,
}));

const ambient = new AsyncLocalStorage<string>();

export function runForProject<T>(projectId: string, fn: () => T): T {
	return ambient.run(projectId, fn);
}

export function currentFocus(): {
	projectId: string | null;
	contactId: string | null;
	sessionId: string | null;
} {
	try {
		const state = focus.get();
		return {
			projectId: state.projectId ?? ambient.getStore() ?? null,
			contactId: state.contactId,
			sessionId: state.sessionId,
		};
	} catch {
		return {
			projectId: ambient.getStore() ?? null,
			contactId: null,
			sessionId: null,
		};
	}
}

export class NoProjectInSessionError extends Error {
	constructor() {
		super(
			"This session has no project. Every task carries one; a session started without it cannot read or write CRM records.",
		);
		this.name = "NoProjectInSessionError";
	}
}

export function currentProjectId(): string {
	const { projectId } = currentFocus();

	if (!projectId) throw new NoProjectInSessionError();

	return projectId;
}

export function focusOn(input: {
	projectId?: string | null;
	contactId?: string | null;
	companyId?: string | null;
	sessionId?: string | null;
}): void {
	focus.update((current) => ({
		...current,
		projectId: input.projectId ?? current.projectId,
		contactId: input.contactId ?? current.contactId,
		companyId: input.companyId ?? current.companyId,
		sessionId: input.sessionId ?? current.sessionId,
	}));
}

export function spend(units = 1): { ok: true } | { ok: false; reason: string } {
	const { spent, budget, exhausted } = focus.get();

	if (spent + units > budget) {
		if (!exhausted) {
			focus.update((current) => ({ ...current, exhausted: true }));
			void bumpCounter(COUNTERS.budgetExhausted);
		}

		return {
			ok: false,
			reason:
				`Research budget for this contact is spent (${spent}/${budget}). ` +
				"Write up what you already have, or schedule a recheck with a reason. Do not keep looking.",
		};
	}

	focus.update((current) => ({ ...current, spent: current.spent + units }));
	return { ok: true };
}

export function setBudget(budget: number): void {
	focus.update((current) => ({ ...current, budget, exhausted: false }));
}
