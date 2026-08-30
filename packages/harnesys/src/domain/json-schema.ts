export type JsonSchema = {
  type?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  enum?: unknown[]
  items?: JsonSchema
  additionalProperties?: boolean | JsonSchema
  [key: string]: unknown
}
