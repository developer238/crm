import { db } from "@crm/db";
import { forProject, type ProjectDb } from "@crm/db/project";
import { currentProjectId } from "./focus";

export type { ProjectDb };

export function projectDb(): ProjectDb {
	return forProject(db, currentProjectId());
}
