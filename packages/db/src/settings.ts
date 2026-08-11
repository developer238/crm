import type { Db } from "./client";
import {
	DEFAULT_REPORTING_CURRENCY,
	isCurrencyCode,
	normalizeCurrency,
} from "./currency";

export const DEFAULT_AGENT_MODEL = {
	id: "zai/glm-5.2-fast",
	contextWindowTokens: 1_000_000,
} as const;

export interface AgentModelSetting {
	id: string;
	contextWindowTokens: number;
	isDefault: boolean;
}

export async function readAgentModel(
	db: Db,
	projectId: string,
): Promise<AgentModelSetting> {
	const row = await db.appSetting.findUnique({
		where: { projectId },
		select: { agentModelId: true, agentModelContextWindow: true },
	});

	if (!row?.agentModelId) {
		return { ...DEFAULT_AGENT_MODEL, isDefault: true };
	}

	return {
		id: row.agentModelId,
		contextWindowTokens:
			row.agentModelContextWindow ?? DEFAULT_AGENT_MODEL.contextWindowTokens,
		isDefault: false,
	};
}

export async function writeAgentModel(
	db: Db,
	projectId: string,
	model: { id: string; contextWindowTokens: number } | null,
): Promise<void> {
	const fields = {
		agentModelId: model?.id ?? null,
		agentModelContextWindow: model?.contextWindowTokens ?? null,
	};

	await db.appSetting.upsert({
		where: { projectId },
		create: { projectId, ...fields },
		update: fields,
	});
}

export const CONTEXT_DEV_SIGNUP_URL = "https://link.context.dev/crm";

export const CONTEXT_DEV_DISCOUNT_CODE = "CRM";

export async function readContextDevKey(
	db: Db,
	projectId: string,
): Promise<string | null> {
	const row = await db.appSetting.findUnique({
		where: { projectId },
		select: { contextDevApiKey: true },
	});

	return row?.contextDevApiKey?.trim() || null;
}

export async function writeContextDevKey(
	db: Db,
	projectId: string,
	key: string,
): Promise<void> {
	const contextDevApiKey = key.trim();

	await db.appSetting.upsert({
		where: { projectId },
		create: { projectId, contextDevApiKey },
		update: { contextDevApiKey },
	});
}

export async function readReportingCurrency(
	db: Db,
	projectId: string,
): Promise<string> {
	const row = await db.appSetting.findUnique({
		where: { projectId },
		select: { reportingCurrency: true },
	});

	const stored = normalizeCurrency(row?.reportingCurrency);

	return isCurrencyCode(stored) ? stored : DEFAULT_REPORTING_CURRENCY;
}

export async function writeReportingCurrency(
	db: Db,
	projectId: string,
	code: string,
): Promise<string> {
	const reportingCurrency = normalizeCurrency(code);

	await db.appSetting.upsert({
		where: { projectId },
		create: { projectId, reportingCurrency },
		update: { reportingCurrency },
	});

	return reportingCurrency;
}

export async function readRatesRefreshedAt(
	db: Db,
	projectId: string,
): Promise<Date | null> {
	const row = await db.appSetting.findUnique({
		where: { projectId },
		select: { ratesRefreshedAt: true },
	});

	return row?.ratesRefreshedAt ?? null;
}

export async function writeRatesRefreshedAt(
	db: Db,
	projectId: string,
	ratesRefreshedAt: Date,
): Promise<void> {
	await db.appSetting.upsert({
		where: { projectId },
		create: { projectId, ratesRefreshedAt },
		update: { ratesRefreshedAt },
	});
}

export function maskKey(key: string): string {
	const trimmed = key.trim();
	return trimmed.length > 4 ? `••••${trimmed.slice(-4)}` : "••••";
}
