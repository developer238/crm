import { EventEmitter } from "node:events";
import {
	Injectable,
	Logger,
	type OnApplicationShutdown,
	type OnModuleInit,
} from "@nestjs/common";
import { Client } from "pg";

export const CHANGE_CHANNEL = "crm_changes";

export type ChangeEvent = {
	projectId: string;
	table: string;
	op: "insert" | "update" | "delete";
	id: string | null;
};

const RETRY_MS = 5_000;

@Injectable()
export class ChangesService implements OnModuleInit, OnApplicationShutdown {
	private readonly logger = new Logger(ChangesService.name);

	private readonly emitter = new EventEmitter();

	private client: Client | null = null;

	private retry: NodeJS.Timeout | null = null;

	private stopped = false;

	constructor() {
		this.emitter.setMaxListeners(0);
	}

	async onModuleInit(): Promise<void> {
		await this.listen();
	}

	onApplicationShutdown(): void {
		this.stopped = true;

		if (this.retry) clearTimeout(this.retry);

		void this.client?.end().catch(() => undefined);
		this.client = null;
	}

	subscribe(projectId: string, onChange: (event: ChangeEvent) => void) {
		const handler = (event: ChangeEvent) => {
			if (event.projectId === projectId) onChange(event);
		};

		this.emitter.on("change", handler);

		return () => this.emitter.off("change", handler);
	}

	private async listen(): Promise<void> {
		if (this.stopped) return;

		const connectionString = process.env.DATABASE_URL;

		if (!connectionString) {
			this.logger.warn({
				message: "Live updates are off: DATABASE_URL is not set",
			});
			return;
		}

		const client = new Client({ connectionString });

		client.on("error", (error: Error) => {
			this.logger.warn({
				message: "Live update listener dropped; reconnecting",
				reason: error.message,
			});
			this.reconnect();
		});

		client.on("notification", (message) => {
			if (message.channel !== CHANGE_CHANNEL || !message.payload) return;

			try {
				this.emitter.emit("change", JSON.parse(message.payload) as ChangeEvent);
			} catch {
				this.logger.warn({ message: "Unreadable change notification" });
			}
		});

		try {
			await client.connect();
			await client.query(`LISTEN ${CHANGE_CHANNEL}`);

			this.client = client;
			this.logger.log({ message: "Listening for live updates" });
		} catch (error) {
			this.logger.warn({
				message: "Could not start the live update listener; retrying",
				reason: error instanceof Error ? error.message : String(error),
			});
			this.reconnect();
		}
	}

	private reconnect(): void {
		if (this.stopped || this.retry) return;

		void this.client?.end().catch(() => undefined);
		this.client = null;

		this.retry = setTimeout(() => {
			this.retry = null;
			void this.listen();
		}, RETRY_MS);
	}
}
