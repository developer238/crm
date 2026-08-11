export function workspaceUrl(
	organizationSlug: string,
	projectSlug: string,
	path = "/",
): string {
	const suffix = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;

	return `/${organizationSlug}/${projectSlug}${suffix}`;
}
