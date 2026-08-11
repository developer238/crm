import type { Request } from "express";

export const PROJECT_HEADER = "x-project-id";

export const PROJECT_COOKIE = "crm.project";

export function requestedProject(req: Request | undefined): string | undefined {
	if (!req) return undefined;

	const header = req.headers[PROJECT_HEADER];
	const fromHeader = Array.isArray(header) ? header[0] : header;

	if (fromHeader?.trim()) return fromHeader.trim();

	return fromCookie(req.headers.cookie);
}

function fromCookie(cookie: string | undefined): string | undefined {
	if (!cookie) return undefined;

	for (const part of cookie.split(";")) {
		const [name, ...rest] = part.trim().split("=");

		if (name !== PROJECT_COOKIE) continue;

		const value = decodeURIComponent(rest.join("=")).trim();

		return value || undefined;
	}

	return undefined;
}
