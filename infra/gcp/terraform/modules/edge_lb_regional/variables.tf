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
  type    = number
  default = 600
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
