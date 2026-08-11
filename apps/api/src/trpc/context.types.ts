import type { Session, SessionUser, WorkspaceRole } from "@crm/auth";
import type { ProjectDb } from "@crm/db/project";
import type { Request } from "express";

export type BaseTrpcContext = {
	req?: Request;
	session: Session | null;
};

export type AuthedTrpcContext = BaseTrpcContext & {
	user: SessionUser;
};

export type ProjectTrpcContext = AuthedTrpcContext & {
	organizationId: string;
	projectId: string;
	role: WorkspaceRole;
	db: ProjectDb;
};
