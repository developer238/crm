"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useCrmCache } from "@/lib/trpc/cache";

type ChangeEvent = {
	projectId: string;
	table: string;
	op: "insert" | "update" | "delete";
	id: string | null;
};

const RETRY_MS = 5_000;

export function LiveUpdates() {
	const cache = useCrmCache();
	const queryClient = useQueryClient();

	useEffect(() => {
		let source: EventSource | null = null;
		let retry: ReturnType<typeof setTimeout> | null = null;
		let stopped = false;

		const apply = (change: ChangeEvent) => {
			switch (change.table) {
				case "company":
					void cache.company(change.id ?? undefined, { settle: "record" });
					break;
				case "contact":
					void cache.contact(change.id ?? undefined, { settle: "record" });
					break;
				case "deal":
					void cache.deal(change.id ?? undefined, { settle: "record" });
					break;
				case "activity":
					void cache.activity({ settle: "record" });
					break;
				default:
					void queryClient.invalidateQueries();
			}
		};

		const open = () => {
			if (stopped) return;

			source = new EventSource("/api/changes/stream");

			source.addEventListener("change", (event) => {
				try {
					apply(JSON.parse((event as MessageEvent<string>).data));
				} catch {
					void queryClient.invalidateQueries();
				}
			});

			source.onerror = () => {
				source?.close();
				source = null;

				if (stopped || retry) return;

				retry = setTimeout(() => {
					retry = null;
					open();
				}, RETRY_MS);
			};
		};

		open();

		return () => {
			stopped = true;
			if (retry) clearTimeout(retry);
			source?.close();
		};
	}, [cache, queryClient]);

	return null;
}
