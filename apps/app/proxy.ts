import { AUTH_COOKIE_PREFIX } from "@crm/auth/cookies";
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { isMarketing } from "@/lib/env";
import {
	type ActiveProject,
	ONBOARDING_PATH,
	RESEARCH_PATH,
	readActiveProject,
	readResearchGate,
	readWorkspaceGate,
} from "@/lib/onboarding";
import { workspaceUrl } from "@/lib/workspace-url";

const LANDING_PATH = "/";

const SIGN_IN_PATH = "/sign-in";

const UNGATED = ["/grant-access", "/eve"];

const SECTIONS = ["/companies", "/contacts", "/deals", "/settings"];

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	if (pathname === SIGN_IN_PATH) return NextResponse.next();

	if (
		getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX }) === null
	) {
		return isPublic(pathname)
			? NextResponse.next()
			: NextResponse.redirect(new URL(SIGN_IN_PATH, request.nextUrl));
	}

	if (isUngated(pathname)) return NextResponse.next();

	// All three answers, every time, and concurrently — so the gate costs one
	// round trip rather than three, and none of them can be stale.
	const [workspace, research, project] = await Promise.all([
		readWorkspaceGate(request),
		readResearchGate(request),
		readActiveProject(request),
	]);

	if (workspace.gate === "required") return sendTo(ONBOARDING_PATH, request);
	if (research === "required") return sendTo(RESEARCH_PATH, request);

	const settled = workspace.gate === "settled" && research === "settled";

	if (!settled || !project) return NextResponse.next();

	return sendTo(appPath(pathname, project), request);
}

function appPath(pathname: string, project: ActiveProject): string {
	const { organizationSlug, projectSlug } = project;

	if (pathname === LANDING_PATH || isSetup(pathname)) {
		return workspaceUrl(organizationSlug, projectSlug);
	}

	if (SECTIONS.some((section) => isUnder(pathname, section))) {
		return workspaceUrl(organizationSlug, projectSlug, pathname);
	}

	const [first, second, ...rest] = pathname.slice(1).split("/");

	if (first === organizationSlug && second === projectSlug) return pathname;

	const tail = [second, ...rest].filter(Boolean);

	if (first === organizationSlug) {
		return workspaceUrl(
			organizationSlug,
			projectSlug,
			tail.length ? `/${tail.join("/")}` : "/",
		);
	}

	const all = [first, ...tail].filter(Boolean);

	return workspaceUrl(
		organizationSlug,
		projectSlug,
		all.length ? `/${all.join("/")}` : "/",
	);
}

function isUnder(pathname: string, prefix: string): boolean {
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isPublic(pathname: string): boolean {
	return pathname === LANDING_PATH && isMarketing();
}

function isUngated(pathname: string): boolean {
	return UNGATED.some((prefix) => isUnder(pathname, prefix));
}

function isSetup(pathname: string): boolean {
	return pathname === ONBOARDING_PATH || pathname === RESEARCH_PATH;
}

function sendTo(path: string, request: NextRequest): NextResponse {
	if (request.nextUrl.pathname === path) return NextResponse.next();

	const url = new URL(path, request.nextUrl);
	url.search = request.nextUrl.search;

	return NextResponse.redirect(url);
}

export const config = {
	matcher: [
		"/((?!api|_next/static|_next/image|.*\\.(?:ico|png|svg|jpg|jpeg|gif|webp|webmanifest)$).*)",
	],
};
