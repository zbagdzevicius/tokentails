variable "project_id" {
  type = string
}

variable "alert_email" {
  description = "Where alerts go (the founder)."
  type        = string
}

variable "api_service" {
  type = string
}

variable "api_max_instances" {
  type = number
}

variable "relay_instance_prefix" {
  type    = string
  default = "tt-relay"
}

variable "max_live_rooms" {
  description = "PARTY_LIMITS.maxLiveRooms (backend/src/pawlegends/party/party-limits.ts); alert at 80 %."
  type        = number
  default     = 60
}

variable "relay_loop_p99_ms" {
  description = "Alert when the relay event-loop p99 stays above this (the relay refuses rooms at 20 ms)."
  type        = number
  default     = 15
}

variable "api_5xx_ratio" {
  type    = number
  default = 0.02
}

variable "api_p95_ms" {
  type    = number
  default = 1500
}

variable "api_host" {
  description = "Public API host checked through Cloudflare."
  type        = string
}

variable "web_host" {
  type = string
}

variable "uptime_period" {
  type    = string
  default = "300s"
}

variable "health_log_exclusion" {
  description = "Drop health-check request logs (LB and Cloud Run) to keep logging cheap."
  type        = bool
  default     = true
}

variable "relay_rtt_eu_p95_ms" {
  description = "Alert when the relay's server-measured EU socket RTT p95 (relay_stats rtt_ms_p95_eu) stays above this."
  type        = number
  default     = 80
}

variable "relay_overrun_p99_ms" {
  description = "Alert when the relay's turn overrun p99 (relay_stats turn_overrun_ms_p99) stays above this."
  type        = number
  default     = 5
}
