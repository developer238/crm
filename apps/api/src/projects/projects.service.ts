import { canManageProjects, isWorkspaceRole } from "@crm/auth";
import type { Db } from "@crm/db";
import { projectSlug, RESERVED_SLUGS } from "@crm/db/project";
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectDatabase } from "../database/database.constants";
import { ProjectResolverService } from "./project-resolver.service";

export type SerializedProject = {
	id: string;
	name: string;
	slug: string;
	website: string | null;
	organizationId: string;
	organizationSlug: string;
	organizationName: string;
};

@Injectable()
export class ProjectsService {
	private readonly logger = new Logger(ProjectsService.name);

	constructor(
		@InjectDatabase() private readonly db: Db,
		private readonly resolver: ProjectResolverService,
	) {}

	async list(userId: string): Promise<SerializedProject[]> {
		const rows = await this.resolver.listForUser(userId);

		return rows.map((row) => ({
			id: row.id,
			name: row.name,
			slug: row.slug,
			website: row.website,
			organizationId: row.organizationId,
			organizationSlug: row.organization.slug,
			organizationName: row.organization.name,
		}));
	}

	async current(userId: string, requested?: string) {
		const resolved = await this.resolver.resolve(userId, requested);
		const projects = await this.list(userId);
		const active = projects.find(
			(project) => project.id === resolved.projectId,
		);

		if (!active) throw new NotFoundException("That project is not available.");

		return { active, projects, role: resolved.role };
	}

	async create(
		userId: string,
		input: { name: string; slug?: string; website?: string },
	): Promise<SerializedProject> {
		const membership = await this.db.member.findFirst({
			where: { userId },
			orderBy: { createdAt: "asc" },
			select: { organizationId: true, role: true },
		});

		if (!membership) {
			throw new ForbiddenException("You are not a member of any organization.");
		}

		const role = isWorkspaceRole(membership.role) ? membership.role : "member";

		if (!canManageProjects(role)) {
			throw new ForbiddenException("Only an admin can add a project.");
		}

		const slug = projectSlug(input.slug ?? input.name);

		if (RESERVED_SLUGS.includes(slug)) {
			throw new BadRequestException(
				"That name collides with a reserved route.",
			);
		}

		const taken = await this.db.project.findFirst({
			where: { organizationId: membership.organizationId, slug },
			select: { id: true },
		});

		if (taken) {
			throw new ConflictException("A project already uses that address.");
		}

		const project = await this.db.project.create({
			data: {
				organizationId: membership.organizationId,
				name: input.name.trim(),
				slug,
				website: input.website?.trim() || null,
			},
			select: {
				id: true,
				name: true,
				slug: true,
				website: true,
				organizationId: true,
				organization: { select: { name: true, slug: true } },
			},
		});

		this.logger.log({
			message: "Project created",
			projectId: project.id,
			organizationId: project.organizationId,
		});

		return {
			id: project.id,
			name: project.name,
			slug: project.slug,
			website: project.website,
			organizationId: project.organizationId,
			organizationSlug: project.organization.slug,
			organizationName: project.organization.name,
		};
	}
}
