import { auth } from "@crm/auth";
import { Controller, Get, Req, Res } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { Request, Response } from "express";
import { ProjectResolverService } from "../projects/project-resolver.service";
import { requestedProject } from "../projects/requested-project";
import { ChangesService } from "./changes.service";

const HEARTBEAT_MS = 25_000;

@Controller("api/changes")
export class ChangesController {
	constructor(
		private readonly changes: ChangesService,
		private readonly projects: ProjectResolverService,
	) {}

	@Get("stream")
	async stream(@Req() req: Request, @Res() res: Response): Promise<void> {
		const session = await auth.api
			.getSession({ headers: fromNodeHeaders(req.headers) })
			.catch(() => null);

		const userId = session?.user?.id;

		if (!userId) {
			res.status(401).end();
			return;
		}

		const resolved = await this.projects
			.resolve(userId, requestedProject(req))
			.catch(() => null);

		if (!resolved) {
			res.status(403).end();
			return;
		}

		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		});
		res.write(`event: ready\ndata: {"projectId":"${resolved.projectId}"}\n\n`);

		const unsubscribe = this.changes.subscribe(resolved.projectId, (event) => {
			res.write(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
		});

		const heartbeat = setInterval(
			() => res.write(": keep-alive\n\n"),
			HEARTBEAT_MS,
		);

		req.on("close", () => {
			clearInterval(heartbeat);
			unsubscribe();
			res.end();
		});
	}
}
