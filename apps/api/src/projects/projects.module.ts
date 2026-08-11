import { Module } from "@nestjs/common";
import { TrpcModule } from "../trpc/trpc.module";
import { ProjectsRouter } from "./projects.router";
import { ProjectsService } from "./projects.service";

@Module({
	imports: [TrpcModule],
	providers: [ProjectsService, ProjectsRouter],
	exports: [ProjectsService],
})
export class ProjectsModule {}
