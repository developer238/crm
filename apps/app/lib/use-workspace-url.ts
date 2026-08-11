"use client";

import { useParams } from "next/navigation";
import { useCallback } from "react";
import { workspaceUrl } from "@/lib/workspace-url";

export function useWorkspaceSlugs(): { org: string; project: string } {
	const { org, project } = useParams<{ org: string; project: string }>();

	return { org, project };
}

export function useWorkspaceSlug(): string {
	return useWorkspaceSlugs().org;
}

export function useProjectSlug(): string {
	return useWorkspaceSlugs().project;
}

export function useWorkspaceUrl(): (path?: string) => string {
	const { org, project } = useWorkspaceSlugs();

	return useCallback(
		(path = "/") => workspaceUrl(org, project, path),
		[org, project],
	);
}
