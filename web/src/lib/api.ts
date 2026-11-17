import type { Asset, Brief, DirectorRequest, DirectorResponse, Job, JobRequest, Project, ProjectSummary, ProviderInput, ProviderKindInfo, ProviderPublic } from '@zsi/shared';

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body instanceof FormData || body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  projects: () => req<ProjectSummary[]>('GET', '/api/projects'),
  project: (id: string) => req<Project>('GET', `/api/projects/${id}`),
  createProject: (name: string) => req<Project>('POST', '/api/projects', { name }),
  updateProject: (id: string, patch: { name?: string; graph?: unknown; brief?: Brief }) => req<Project>('PUT', `/api/projects/${id}`, patch),
  deleteProject: (id: string) => req('DELETE', `/api/projects/${id}`),

  providerKinds: () => req<ProviderKindInfo[]>('GET', '/api/provider-kinds'),
  providers: () => req<ProviderPublic[]>('GET', '/api/providers'),
  createProvider: (p: ProviderInput) => req<ProviderPublic>('POST', '/api/providers', p),
  updateProvider: (id: string, p: Partial<ProviderInput>) => req<ProviderPublic>('PUT', `/api/providers/${id}`, p),
  deleteProvider: (id: string) => req('DELETE', `/api/providers/${id}`),
  testProvider: (id: string) => req<{ ok: boolean; message: string }>('POST', `/api/providers/${id}/test`),

  importProduct: (projectId: string, url: string) => req<{ brief: Partial<Brief>; assets: Asset[] }>('POST', `/api/projects/${projectId}/import-product`, { url }),
  director: (r: DirectorRequest) => req<DirectorResponse>('POST', '/api/director', r),

  submitJob: (r: JobRequest) => req<Job>('POST', '/api/jobs', r),
  job: (id: string) => req<Job>('GET', `/api/jobs/${id}`),
  cancelJob: (id: string) => req('POST', `/api/jobs/${id}/cancel`),

  assets: (projectId: string) => req<Asset[]>('GET', `/api/projects/${projectId}/assets`),
  upload: (projectId: string, files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('file', f));
    return req<Asset[]>('POST', `/api/projects/${projectId}/assets`, fd);
  },
};
