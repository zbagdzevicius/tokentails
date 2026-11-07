variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "name" {
  type    = string
  default = "tt-edge"
}

variable "network" {
  description = "VPC id (a regional external ALB forwarding rule names its network)."
  type        = string
}

variable "proxy_only_subnet_id" {
  description = "The proxy-only subnet must exist before the forwarding rule."
  type        = string
}

variable "api_hosts" {
  description = "Hosts served by tt-api, with /pawlegends/ws on the relay (api.tokentails.com and the shadow gcp-api)."
  type        = list(string)
}

variable "web_hosts" {
  type = list(string)
}

variable "cms_hosts" {
  type = list(string)
}

variable "api_service" {
  description = "Cloud Run service name of the API."
  type        = string
}

variable "web_service" {
  type = string
}

variable "cms_service" {
  type = string
}

variable "relay_instance_group" {
  type = string
}

variable "relay_health_check" {
  type = string
}

variable "relay_port_name" {
  type    = string
  default = "http"
}

variable "relay_paths" {
  type    = list(string)
  default = ["/pawlegends/ws", "/pawlegends/ws/*"]
}

variable "relay_timeout_sec" {
  description = "Backend service timeout for the relay: on an ALB this is the longest a WebSocket may live."
  type        = number
  default     = 86400

  validation {
    condition     = var.relay_timeout_sec >= 3600
    error_message = "WebSockets must be allowed to live at least an hour (a party can last 3 h)."
  }
}

variable "relay_draining_sec" {
  description = <<-EOT
    Connection draining on the relay backend. GCP waits this long before it deletes or recreates a MIG VM that serves a
    backend, which with one relay only delays the replacement past the relay's 120 s restore window (every handed-off
    match lost). The relay hands its rooms off on SIGTERM instead, so no draining.
  EOT
  type        = number
  default     = 0

  validation {
    condition     = var.relay_draining_sec >= 0 && var.relay_draining_sec <= 30
    error_message = "Keep relay draining at 30 s or less: a VM replacement must finish inside the 120 s restore window."
  }
}

variable "cloudflare_ipv4" {
  description = "Cloudflare edge ranges (https://www.cloudflare.com/ips-v4). The only sources Cloud Armor admits."
  type        = list(string)
}

variable "cloudflare_ipv6" {
  description = "https://www.cloudflare.com/ips-v6"
  type        = list(string)
}

variable "ws_rate_limit_per_minute" {
  description = "Per-player (cf-connecting-ip) WebSocket upgrades per minute on /pawlegends/ws before Cloud Armor answers 429."
  type        = number
  default     = 120
}

variable "log_sample_rate" {
  description = "Load balancer request log sampling for the HTTP backends (the relay logs every upgrade)."
  type        = number
  default     = 0.2
}

variable "canary_tag" {
  description = "Cloud Run revision tag the canary backends point at (deploy-gcp.yml deploys new revisions with it)."
  type        = string
  default     = "canary"
}

variable "canary_header" {
  description = "Request header (value 1) that routes a request to the canary revision, for smoke tests before traffic moves."
  type        = string
  default     = "x-tt-canary"
}

variable "certificate_mode" {
  description = "managed: Google-managed certificate with DNS authorization (production). self_managed: upload self_managed_certificate (a test stack without DNS)."
  type        = string
  default     = "managed"

  validation {
    condition     = contains(["managed", "self_managed"], var.certificate_mode)
    error_message = "certificate_mode is managed or self_managed."
  }
}

variable "self_managed_certificate" {
  description = "PEM certificate and private key, used only when certificate_mode = self_managed."
  type = object({
    certificate_pem = string
    private_key_pem = string
  })
  default   = null
  sensitive = true
}

variable "http_listener" {
  description = "Also serve plain HTTP on port 80 (test stacks only; production is HTTPS from Cloudflare)."
  type        = bool
  default     = false
}

variable "extra_allowed_source_ranges" {
  description = "Extra source ranges Cloud Armor admits besides Cloudflare (test stacks only: the operator's /32). Empty in production."
  type        = list(string)
  default     = []

  validation {
    condition = length(var.extra_allowed_source_ranges) <= 10 && alltrue([
      for c in var.extra_allowed_source_ranges : can(cidrhost(c, 0)) && !contains(["0.0.0.0/0", "::/0"], c)
    ])
    error_message = "At most 10 CIDRs, never 0.0.0.0/0 or ::/0."
  }
}
