let loggerConfigured = false

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || loggerConfigured) return

  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST

  if (!token || !host) {
    if (process.env.NODE_ENV !== "production") {
      const missingVariable = token
        ? "NEXT_PUBLIC_POSTHOG_HOST"
        : "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN"

      console.warn(
        `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
      )
    }
    return
  }

  const [
    { BatchLogRecordProcessor, LoggerProvider },
    { OTLPLogExporter },
    { SeverityNumber },
    { resourceFromAttributes },
  ] = await Promise.all([
    import("@opentelemetry/sdk-logs"),
    import("@opentelemetry/exporter-logs-otlp-http"),
    import("@opentelemetry/api-logs"),
    import("@opentelemetry/resources"),
  ])

  const loggerProvider = new LoggerProvider({
    resource: resourceFromAttributes({ "service.name": "tokentails-web" }),
    processors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: `${host.replace(/\/$/, "")}/i/v1/logs`,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }),
      }),
    ],
  })
  const logger = loggerProvider.getLogger("posthog-log-exporter")

  logger.emit({
    body: "PostHog log exporter configured",
    severityNumber: SeverityNumber.INFO,
    attributes: { runtime: "nodejs" },
  })
  logger.emit({
    body: "Token Tails web server started",
    severityNumber: SeverityNumber.INFO,
    attributes: { runtime: "nodejs", deployment: process.env.NODE_ENV ?? "unknown" },
  })

  loggerConfigured = true
}
