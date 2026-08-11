import { MAX_SLUG } from "@crm/db/project";
import { z } from "zod";

export const createProjectInput = z.object({
	name: z.string().trim().min(1).max(120),
	slug: z.string().trim().max(MAX_SLUG).optional(),
	website: z.string().trim().max(255).optional(),
});

export const renameProjectInput = z.object({
	id: z.string().min(1),
	name: z.string().trim().min(1).max(120),
	slug: z.string().trim().max(MAX_SLUG).optional(),
});
