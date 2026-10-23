import type { SavedProject } from '../utils/projectStorage';

type Credentials = { endpoint: string; anonKey: string; accessToken: string };
export type CloudProject = { id: string; team_id: string; name: string; revision: number; updated_at: string; document: SavedProject };
export type CloudTeam = { id: string; name: string; created_by: string };

async function request<T>(auth: Credentials, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(auth.endpoint.replace(/\/$/, '') + '/rest/v1/' + path, {
    ...init,
    headers: {
      apikey: auth.anonKey,
      Authorization: 'Bearer ' + auth.accessToken,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error('Cloud HTTP ' + response.status + ': ' + body.slice(0, 240));
  return (body ? JSON.parse(body) : []) as T;
}

export function listCloudTeams(auth: Credentials) {
  return request<CloudTeam[]>(auth, 'iron_teams?select=id,name,created_by&order=name');
}

export function createCloudTeam(auth: Credentials, name: string, userId: string) {
  return request<CloudTeam[]>(auth, 'iron_teams?select=id,name,created_by', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name: name.trim(), created_by: userId }),
  });
}

export function listCloudProjects(auth: Credentials, teamId: string) {
  return request<CloudProject[]>(auth, 'iron_projects?select=id,team_id,name,revision,updated_at,document&team_id=eq.' + encodeURIComponent(teamId) + '&order=updated_at.desc');
}

export function createCloudProject(auth: Credentials, teamId: string, document: SavedProject, userId: string) {
  return request<CloudProject[]>(auth, 'iron_projects?select=id,team_id,name,revision,updated_at,document', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ team_id: teamId, name: document.robot.name, document, updated_by: userId }),
  });
}

/** Atomic compare-and-swap through a server-side transaction and audit revision. */
export async function updateCloudProject(auth: Credentials, project: CloudProject, document: SavedProject, _userId: string) {
  const updated = await request<CloudProject>(auth, 'rpc/iron_save_project', {
    method: 'POST',
    body: JSON.stringify({
      p_project_id: project.id,
      p_expected_revision: project.revision,
      p_document: document,
      p_name: document.robot.name,
    }),
  });
  return updated;
}
