import type { Db } from "@crm/db";
import {
	configHash,
	mintSiteId,
	readTrackingConfig,
	type TrackingConfig,
} from "@crm/db/tracking";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Cache } from "cache-manager";
import { InjectDatabase } from "../database/database.constants";
import { currentProjectId } from "../projects/project-context";

const CONFIG_TTL_MS = 5 * 60_000;

const configKey = (projectId: string) => `tracking:config:${projectId}`;

export interface CompiledConfig {
	config: TrackingConfig;
	hash: string;
}

@Injectable()
export class TrackingConfigService {
	private readonly logger = new Logger(TrackingConfigService.name);

	private generation = 0;

	constructor(
		@InjectDatabase() private readonly db: Db,
		@Inject(CACHE_MANAGER) private readonly cache: Cache,
	) {}

	async compiled(
		projectId = currentProjectId(),
	): Promise<CompiledConfig | null> {
		const cached = await this.cache.get<CompiledConfig>(configKey(projectId));
		if (cached) return cached;

		const read = this.generation;
		const config = await readTrackingConfig(this.db, projectId);
		if (!config) return null;

		const compiled = { config, hash: configHash(config) };

		if (
			read === this.generation &&
			(await this.current(compiled.hash, projectId))
		) {
			await this.cache.set(configKey(projectId), compiled, CONFIG_TTL_MS);
		}

		return compiled;
	}

	private async current(hash: string, projectId: string): Promise<boolean> {
		const row = await this.db.appSetting.findUnique({
			where: { projectId },
			select: { trackingConfigHash: true },
		});

		return row?.trackingConfigHash === hash;
	}

	async projectForSite(siteId: string): Promise<string | null> {
		const row = await this.db.appSetting.findFirst({
			where: { trackingSiteId: siteId },
			select: { projectId: true },
		});

		return row?.projectId ?? null;
	}

	async forSite(siteId: string): Promise<CompiledConfig | null> {
		const projectId = await this.projectForSite(siteId);
		if (!projectId) return null;

		const compiled = await this.compiled(projectId);
		return compiled?.config.siteId === siteId ? compiled : null;
	}

	async invalidate(projectId = currentProjectId()): Promise<void> {
		this.generation += 1;
		const written = this.generation;

		await this.cache.del(configKey(projectId));

		const config = await readTrackingConfig(this.db, projectId);

		if (!config) {
			await this.db.appSetting.updateMany({
				where: { projectId },
				data: { trackingConfigHash: null },
			});

			return;
		}

		const hash = configHash(config);

		await this.db.appSetting.update({
			where: { projectId },
			data: { trackingConfigHash: hash },
		});

		if (written !== this.generation) return;
		if (!(await this.current(hash, projectId))) return;

		await this.cache.set(configKey(projectId), { config, hash }, CONFIG_TTL_MS);
	}

	async ensureSiteId(): Promise<string> {
		const projectId = currentProjectId();

		const existing = await this.db.appSetting.findUnique({
			where: { projectId },
			select: { trackingSiteId: true },
		});

		if (existing?.trackingSiteId) return existing.trackingSiteId;

		const trackingSiteId = mintSiteId();

		await this.db.appSetting.upsert({
			where: { projectId },
			create: { projectId, trackingSiteId },
			update: { trackingSiteId },
		});

		await this.invalidate();

		this.logger.log({ message: "Tracking site id minted" });

		return trackingSiteId;
	}

	async rotateSiteId(): Promise<string> {
		const projectId = currentProjectId();
		const trackingSiteId = mintSiteId();

		await this.db.appSetting.upsert({
			where: { projectId },
			create: { projectId, trackingSiteId },
			update: { trackingSiteId },
		});

		await this.invalidate();

		this.logger.warn({ message: "Tracking site id rotated" });

		return trackingSiteId;
	}
}
