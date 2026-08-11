"use server";

import { cookies } from "next/headers";

export const PROJECT_COOKIE = "crm.project";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function rememberProject(projectId: string): Promise<void> {
	const store = await cookies();

	store.set(PROJECT_COOKIE, projectId, {
		path: "/",
		maxAge: ONE_YEAR_SECONDS,
		sameSite: "lax",
		httpOnly: false,
	});
}
