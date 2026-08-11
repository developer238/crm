"use client";

import Add from "@carbon/icons-react/es/Add";
import Checkmark from "@carbon/icons-react/es/Checkmark";
import ChevronDown from "@carbon/icons-react/es/ChevronDown";
import { Button } from "@crm/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@crm/ui/components/dropdown-menu";
import { Input } from "@crm/ui/components/input";
import { Label } from "@crm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { rememberProject } from "@/lib/active-project";
import { useTRPC } from "@/lib/trpc/client";
import { workspaceUrl } from "@/lib/workspace-url";

export function ProjectSwitcher() {
	const trpc = useTRPC();
	const router = useRouter();
	const queryClient = useQueryClient();
	const current = useQuery(trpc.projects.current.queryOptions());
	const [creating, setCreating] = useState(false);
	const [name, setName] = useState("");

	const create = useMutation(
		trpc.projects.create.mutationOptions({
			onSuccess: (project) => {
				setCreating(false);
				setName("");
				void queryClient.invalidateQueries();
				go(project.organizationSlug, project.slug, project.id);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const go = (organizationSlug: string, slug: string, id: string) => {
		void rememberProject(id).then(() => {
			router.push(workspaceUrl(organizationSlug, slug));
			router.refresh();
		});
	};

	const active = current.data?.active;
	const projects = current.data?.projects ?? [];

	if (!active) return null;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className="min-w-0 gap-1"
						aria-label="Switch project"
					>
						<span className="min-w-0 truncate">{active.name}</span>
						<ChevronDown className="shrink-0 opacity-60" />
					</Button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="start" className="w-56">
					<DropdownMenuLabel>{active.organizationName}</DropdownMenuLabel>
					<DropdownMenuSeparator />

					{projects.map((project) => (
						<DropdownMenuItem
							key={project.id}
							onSelect={() =>
								go(project.organizationSlug, project.slug, project.id)
							}
						>
							<span className="min-w-0 truncate">{project.name}</span>
							{project.id === active.id ? (
								<Checkmark className="ml-auto shrink-0" />
							) : null}
						</DropdownMenuItem>
					))}

					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={() => setCreating(true)}>
						<Add className="shrink-0" />
						New project
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog open={creating} onOpenChange={setCreating}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>New project</DialogTitle>
						<DialogDescription>
							A project is a CRM of its own. Companies, contacts, deals and
							agent work in one never appear in another.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-2">
						<Label htmlFor="project-name">Name</Label>
						<Input
							id="project-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="Northern Europe"
							autoComplete="off"
						/>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setCreating(false)}>
							Cancel
						</Button>
						<Button
							disabled={!name.trim() || create.isPending}
							onClick={() => create.mutate({ name: name.trim() })}
						>
							Create
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
