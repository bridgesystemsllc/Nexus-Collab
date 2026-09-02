// ─── Connector catalog ───────────────────────────────────────
// Registry of supported connector types. The UI fetches this via
// GET /api/v1/integrations/catalog to show available connectors
// without exposing any secrets.

export type AuthType = 'NONE' | 'API_KEY' | 'BEARER' | 'BASIC' | 'OAUTH2' | 'WEBHOOK_SECRET'

export interface ConnectorDefinition {
  type: string
  name: string
  description: string
  category: 'http' | 'mcp' | 'webhook' | 'erp' | 'oauth'
  authTypes: AuthType[]
  singleton: boolean
  configSchema: {
    fields: Array<{
      key: string
      label: string
      type: 'text' | 'password' | 'url' | 'select' | 'textarea' | 'number' | 'boolean'
      required: boolean
      placeholder?: string
      options?: Array<{ value: string; label: string }>
    }>
  }
}

export const CONNECTOR_CATALOG: ConnectorDefinition[] = [
  {
    type: 'GENERIC_HTTP',
    name: 'HTTP Connector',
    description: 'Connect to any REST API endpoint with configurable authentication',
    category: 'http',
    authTypes: ['NONE', 'API_KEY', 'BEARER', 'BASIC'],
    singleton: false,
    configSchema: {
      fields: [
        { key: 'baseUrl', label: 'Base URL', type: 'url', required: true, placeholder: 'https://api.example.com' },
        { key: 'authType', label: 'Auth Type', type: 'select', required: true, options: [
          { value: 'NONE', label: 'None' },
          { value: 'API_KEY', label: 'API Key' },
          { value: 'BEARER', label: 'Bearer Token' },
          { value: 'BASIC', label: 'Basic Auth' },
        ]},
        { key: 'apiKey', label: 'API Key', type: 'password', required: false, placeholder: 'Your API key' },
        { key: 'apiKeyHeader', label: 'API Key Header', type: 'text', required: false, placeholder: 'X-API-Key' },
        { key: 'bearerToken', label: 'Bearer Token', type: 'password', required: false },
        { key: 'basicUsername', label: 'Username', type: 'text', required: false },
        { key: 'basicPassword', label: 'Password', type: 'password', required: false },
        { key: 'defaultHeaders', label: 'Default Headers (JSON)', type: 'textarea', required: false, placeholder: '{"Content-Type": "application/json"}' },
        { key: 'timeoutMs', label: 'Timeout (ms)', type: 'number', required: false, placeholder: '30000' },
      ],
    },
  },
  {
    type: 'GENERIC_MCP',
    name: 'MCP Connector',
    description: 'Connect to Model Context Protocol servers for AI tool integration',
    category: 'mcp',
    authTypes: ['NONE', 'API_KEY', 'BEARER'],
    singleton: false,
    configSchema: {
      fields: [
        { key: 'serverUrl', label: 'Server URL', type: 'url', required: true, placeholder: 'https://mcp.example.com' },
        { key: 'authType', label: 'Auth Type', type: 'select', required: true, options: [
          { value: 'NONE', label: 'None' },
          { value: 'API_KEY', label: 'API Key' },
          { value: 'BEARER', label: 'Bearer Token' },
        ]},
        { key: 'apiKey', label: 'API Key', type: 'password', required: false },
        { key: 'bearerToken', label: 'Bearer Token', type: 'password', required: false },
        { key: 'capabilities', label: 'Capabilities (JSON)', type: 'textarea', required: false, placeholder: '["tools", "prompts"]' },
      ],
    },
  },
  {
    type: 'GENERIC_WEBHOOK',
    name: 'Webhook Receiver',
    description: 'Receive webhook events from external services with secret verification',
    category: 'webhook',
    authTypes: ['WEBHOOK_SECRET'],
    singleton: false,
    configSchema: {
      fields: [
        { key: 'description', label: 'Description', type: 'text', required: false, placeholder: 'What sends webhooks here?' },
        { key: 'signatureHeader', label: 'Signature Header', type: 'text', required: false, placeholder: 'X-Webhook-Signature' },
        { key: 'signatureAlgorithm', label: 'Signature Algorithm', type: 'select', required: false, options: [
          { value: 'hmac-sha256', label: 'HMAC-SHA256' },
          { value: 'hmac-sha1', label: 'HMAC-SHA1' },
          { value: 'none', label: 'No Verification' },
        ]},
      ],
    },
  },
]

export const SINGLETON_TYPES = new Set([
  'ERP_KAREVE_SYNC',
  'MICROSOFT_OUTLOOK',
  'MICROSOFT_TEAMS',
  'MICROSOFT_ONEDRIVE',
  'ZAPIER',
])

export function getConnectorDefinition(type: string): ConnectorDefinition | undefined {
  return CONNECTOR_CATALOG.find((c) => c.type === type)
}

export function isSingletonType(type: string): boolean {
  return SINGLETON_TYPES.has(type)
}

export function isGenericType(type: string): boolean {
  return type.startsWith('GENERIC_')
}
