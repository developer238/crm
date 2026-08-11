import type { Db } from "@crm/db";
import { Global, Module } from "@nestjs/common";
import { DATABASE } from "../database/database.constants";
import { PROJECT_DATABASE } from "./project-context";
import { createProjectDatabase } from "./project-database";
import { ProjectResolverService } from "./project-resolver.service";

@Global()
@Module({
	providers: [
		ProjectResolverService,
		{
			provide: PROJECT_DATABASE,
			inject: [DATABASE],
			useFactory: (raw: Db) => createProjectDatabase(raw),
		},
	],
	exports: [ProjectResolverService, PROJECT_DATABASE],
})
export class ProjectContextModule {}
