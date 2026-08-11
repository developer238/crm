import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type {
	MiddlewareOptions,
	MiddlewareResponse,
	TRPCMiddleware,
} from "nestjs-trpc";
import { setRequestUserId } from "../../logging/request-context";
import { runInProjectContext } from "../../projects/project-context";
import { ProjectResolverService } from "../../projects/project-resolver.service";
import { requestedProject } from "../../projects/requested-project";
import type { AuthedTrpcContext, BaseTrpcContext } from "../context.types";

@Injectable()
export class AuthMiddleware implements TRPCMiddleware {
	constructor(private readonly projects: ProjectResolverService) {}

	async use(opts: MiddlewareOptions): Promise<MiddlewareResponse> {
		const ctx = opts.ctx as BaseTrpcContext;
		const user = ctx.session?.user;

		if (!user) {
			throw new TRPCError({ code: "UNAUTHORIZED" });
		}

		setRequestUserId(user.id);

		const nextCtx: AuthedTrpcContext = { ...ctx, user };

		const resolved = await this.projects
			.resolve(user.id, requestedProject(ctx.req))
			.catch(() => null);

		if (!resolved) return opts.next({ ctx: nextCtx });

		return runInProjectContext(resolved, () => opts.next({ ctx: nextCtx }));
	}
}
