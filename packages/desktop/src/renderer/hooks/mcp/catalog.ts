import { mcpService } from '@/common/adapter/ipcBridge';
import type { IMcpServer, IMcpServerTransport, ISessionMcpServer } from '@/common/config/storage';
import { getClientBusinessSetting } from '@/renderer/services/clientBusinessSettings';

type BackendMcpTransport = Exclude<IMcpServerTransport, { type: 'streamable_http' }>;

type BackendMcpPayload = {
  name: string;
  description?: string;
  transport: BackendMcpTransport;
  original_json: string;
  builtin?: boolean;
};

const isBuiltinServer = (server: IMcpServer) => server.builtin === true;

const isCatalogServer = (value: unknown): value is IMcpServer => {
  if (!value || typeof value !== 'object') return false;
  const server = value as Partial<IMcpServer>;
  return typeof server.id === 'string' && server.id.length > 0 && typeof server.name === 'string';
};

const normalizeServerName = (name: string) => name.trim().toLowerCase();

const getCatalogServerKey = (server: Pick<IMcpServer, 'id' | 'name' | 'builtin'>) => {
  const normalizedName = normalizeServerName(server.name);
  if (server.builtin === true) {
    return `builtin:${normalizedName || server.id}`;
  }
  return `user:${normalizedName || server.id}`;
};

const dedupeServers = (servers: IMcpServer[]) => {
  const seen = new Set<string>();
  const deduped: IMcpServer[] = [];

  for (const server of servers) {
    const key = getCatalogServerKey(server);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(server);
  }

  return deduped;
};

const normalizeTransportForBackend = (transport: IMcpServerTransport): BackendMcpTransport => {
  if (transport.type === 'streamable_http') {
    return {
      type: 'http',
      url: transport.url,
      headers: transport.headers,
    };
  }
  return transport;
};

export const toBackendMcpPayload = (
  server: Pick<IMcpServer, 'name' | 'description' | 'transport' | 'original_json' | 'builtin'>
): BackendMcpPayload => ({
  name: server.name,
  description: server.description,
  transport: normalizeTransportForBackend(server.transport),
  original_json: server.original_json || '{}',
  builtin: Boolean(server.builtin),
});

export const toSessionMcpServer = (server: Pick<IMcpServer, 'id' | 'name' | 'transport'>): ISessionMcpServer => ({
  id: server.id,
  name: server.name,
  transport: server.transport,
});

export const ensureBackendMcpCatalog = async (): Promise<{
  userServers: IMcpServer[];
  builtinServers: IMcpServer[];
  allServers: IMcpServer[];
}> => {
  // Older installations can contain a null/object value here after a partial
  // settings migration. Treat malformed client data as empty instead of
  // throwing before the backend MCP catalog is queried.
  const rawLocalServers = await getClientBusinessSetting('mcp.config').catch((): undefined => undefined);
  const localServers: IMcpServer[] = Array.isArray(rawLocalServers) ? rawLocalServers.filter(isCatalogServer) : [];
  const builtinServers = dedupeServers(localServers.filter(isBuiltinServer));
  const rawUserServers = await mcpService.listServers.invoke();
  const userServers = dedupeServers(Array.isArray(rawUserServers) ? rawUserServers.filter(isCatalogServer) : []);

  const allServers = dedupeServers([...userServers, ...builtinServers]);

  return {
    userServers,
    builtinServers,
    allServers,
  };
};
