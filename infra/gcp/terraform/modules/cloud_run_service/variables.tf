variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "name" {
  type = string
}

variable "image" {
  description = "Initial image. CI deploys later images; Terraform ignores image changes after creation."
  type        = string
}

variable "service_account" {
  type = string
}

variable "cpu" {
  type    = string
  default = "1"
}

variable "memory" {
  type    = string
  default = "512Mi"
}

variable "cpu_always_allocated" {
  description = "Instance-based billing: CPU stays allocated between requests (needed for in-process crons)."
  type        = bool
  default     = false
}

variable "startup_cpu_boost" {
  type    = bool
  default = true
}

variable "min_instances" {
  type    = number
  default = 0
}

variable "max_instances" {
  type    = number
  default = 2
}

variable "concurrency" {
  type    = number
  default = 80
}

variable "timeout_seconds" {
  type    = number
  default = 300
}

variable "port" {
  type    = number
  default = 8080
}

variable "env" {
  description = "Plain environment variables (no secrets)."
  type        = map(string)
  default     = {}
}

variable "secret_env" {
  description = "Env var name => { secret, version }. The version is pinned (a number), never 'latest'."
  type = map(object({
    secret  = string
    version = string
  }))
  default = {}

  validation {
    condition     = alltrue([for v in values(var.secret_env) : can(regex("^[0-9]+$", v.version))])
    error_message = "Pin every secret to a numeric version."
  }
}

variable "startup_probe_path" {
  description = "HTTP startup probe path; null uses a TCP probe on the port."
  type        = string
  default     = null
}

variable "liveness_probe_path" {
  type    = string
  default = null
}

variable "network" {
  description = "VPC for direct VPC egress (all traffic leaves through Cloud NAT and its static IP)."
  type        = string
}

variable "subnetwork" {
  type = string
}

variable "ingress" {
  type    = string
  default = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  validation {
    condition     = contains(["INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER", "INGRESS_TRAFFIC_INTERNAL_ONLY"], var.ingress)
    error_message = "Services are reached only through the load balancer (Cloudflare in front): no INGRESS_TRAFFIC_ALL."
  }
}

variable "labels" {
  type    = map(string)
  default = {}
}

variable "deletion_protection" {
  type    = bool
  default = true
}
