import { notFound, unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppHeader, AppHeaderFallback } from "@/components/app-header";
import { AppIconRail, AppIconRailFallback } from "@/components/app-icon-rail";
import { QuickSwitcher } from "@/components/crm/quick-switcher";
import { RecordSheetHost } from "@/components/crm/record-sheet/record-sheet-host";
import { LiveUpdates } from "@/components/live-updates";
import { MobileNavProvider } from "@/components/mobile-nav";
import { requireMailboxAccess } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";

export default function AppLayout({
	children,
	params,
}: LayoutProps<"/[org]/[project]">) {
	return (
		<MobileNavProvider>
			<div className="isolate flex h-svh flex-col">
				<Suspense fallback={<AppHeaderFallback />}>
					<WorkspaceHeader params={params} />
				</Suspense>

				<div className="flex min-h-0 flex-1">
					<Suspense fallback={<AppIconRailFallback />}>
						<AppIconRail />
					</Suspense>
					{children}
				</div>

				<Suspense fallback={null}>
					<RecordSheetHost />
				</Suspense>

				<Suspense fallback={null}>
					<QuickSwitcher />
				</Suspense>

				<LiveUpdates />
			</div>
		</MobileNavProvider>
	);
}

async function WorkspaceHeader({
	params,
}: Pick<LayoutProps<"/[org]/[project]">, "params">) {
	await connection();
	const projectPromise = getServerQueryClient()
		.fetchQuery(getServerTrpc().projects.current.queryOptions())
		.catch((error: unknown) => {
			unstable_rethrow(error);
			return null;
		});
	const [{ user }, { org, project }, current] = await Promise.all([
		requireMailboxAccess(),
		params,
		projectPromise,
	]);

	if (
		current &&
		(current.active.organizationSlug !== org || current.active.slug !== project)
	) {
		notFound();
	}

	return (
		<HydrateClient>
			<AppHeader
				user={{
					name: user.name,
					email: user.email,
					image: user.image ?? null,
				}}
			/>
		</HydrateClient>
	);
}
