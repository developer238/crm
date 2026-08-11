import { isWorkspaceRole, type WorkspaceRole } from "@crm/auth";
import type { Db } from "@crm/db";
import {
	ForbiddenException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";

export type ResolvedProject = {
	organizationId: string;
	projectId: string;
	role: WorkspaceRole;
};

@Injectable()
export class ProjectResolverService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	async resolve(
		userId: string,
		requested: string | undefined,
	): Promise<ResolvedProject> {
		const memberships = await this.db.member.findMany({
			where: { userId },
			select: { organizationId: true, role: true },
		});

		if (memberships.length === 0) {
			throw new ForbiddenException("You are not a member of any organization.");
		}

		const organizationIds = memberships.map(
			(membership) => membership.organizationId,
		);

		const project = requested
			? await this.db.project.findFirst({
					where: {
						organizationId: { in: organizationIds },
						OR: [{ id: requested }, { slug: requested }],
					},
					select: { id: true, organizationId: true },
				})
			: await this.db.project.findFirst({
					where: { organizationId: { in: organizationIds } },
					orderBy: { createdAt: "asc" },
					select: { id: true, organizationId: true },
				});

		if (!project) {
			throw new NotFoundException(
				requested
					? "That project does not exist, or you are not a member of it."
					: "You have no projects yet.",
			);
		}

		const membership = memberships.find(
			(candidate) => candidate.organizationId === project.organizationId,
		);

		if (!membership) {
			throw new ForbiddenException("You are not a member of this project.");
		}

		return {
			organizationId: project.organizationId,
			projectId: project.id,
			role: isWorkspaceRole(membership.role) ? membership.role : "member",
		};
	}

	async listForUser(userId: string) {
		const memberships = await this.db.member.findMany({
			where: { userId },
			select: { organizationId: true },
		});

		return this.db.project.findMany({
			where: {
				organizationId: {
					in: memberships.map((membership) => membership.organizationId),
				},
			},
			orderBy: [{ organizationId: "asc" }, { createdAt: "asc" }],
			select: {
				id: true,
				name: true,
				slug: true,
				website: true,
				organizationId: true,
				organization: { select: { name: true, slug: true } },
			},
		});
	}
}
