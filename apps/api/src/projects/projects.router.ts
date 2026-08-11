import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import { createProjectInput } from "./projects.contracts";
import { ProjectsService } from "./projects.service";
import { requestedProject } from "./requested-project";

@Router({ alias: "projects" })
@UseMiddlewares(AuthMiddleware)
export class ProjectsRouter {
	constructor(
		@Inject(ProjectsService) private readonly projects: ProjectsService,
	) {}

	@Query()
	async list(@Ctx() ctx: AuthedTrpcContext) {
		return this.projects.list(ctx.user.id);
	}

	@Query()
	async current(@Ctx() ctx: AuthedTrpcContext) {
		return this.projects.current(ctx.user.id, requestedProject(ctx.req));
	}

	@Mutation({ input: createProjectInput })
	async create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof createProjectInput>,
	) {
		return this.projects.create(ctx.user.id, input);
	}
}
