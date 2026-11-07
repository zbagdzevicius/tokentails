variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "zones" {
  description = "Zones the regional MIG may place the one relay VM in."
  type        = list(string)
}

variable "name" {
  type    = string
  default = "tt-relay"
}

variable "machine_type" {
  description = "t2d-standard-2: 2 physical cores, no SMT. os.cpus()=2 gives 1 referee worker and a free core for the event loop."
  type        = string
  default     = "t2d-standard-2"

  validation {
    condition     = can(regex("^(t2d|c3d|c2d|n2d|c3|c4|n4|n2|e2)-[a-z]+-[0-9]+$", var.machine_type))
    error_message = "Use a standard x86 machine type (t2d-standard-2 by default)."
  }
}

variable "boot_disk_gb" {
  type    = number
  default = 20
}

variable "image_family" {
  description = "Container-Optimized OS image."
  type        = string
  default     = "projects/cos-cloud/global/images/family/cos-stable"
}

variable "network" {
  type = string
}

variable "subnetwork" {
  type = string
}

variable "service_account" {
  type = string
}

variable "network_tag" {
  type    = string
  default = "tt-relay"
}

variable "port" {
  type    = number
  default = 8080
}

variable "initial_image" {
  description = "First relay image (registry/backend:sha). CI owns the metadata key afterwards (ignore_changes)."
  type        = string
}

variable "image_metadata_key" {
  type    = string
  default = "tt-relay-image"
}

variable "plain_env" {
  description = "Plain env for the relay container. NODE_ENV, BACKEND_ROLE and PORT are always set by this module."
  type        = map(string)
  default     = {}

  validation {
    condition     = alltrue([for k, v in var.plain_env : can(regex("^[A-Z][A-Z0-9_]*$", k)) && !can(regex("['\\n\\r]", v))])
    error_message = "Plain env names are UPPER_CASE and values have no quotes or newlines."
  }
}

variable "secrets" {
  description = "Secret name (= env var) => pinned numeric version, read at every start into tmpfs."
  type        = map(string)
  default     = {}

  validation {
    condition     = alltrue([for v in values(var.secrets) : can(regex("^[0-9]+$", v))])
    error_message = "Pin every relay secret to a numeric version."
  }
}

variable "stop_timeout_seconds" {
  description = "docker stop grace: the relay checkpoints and hands rooms off within it."
  type        = number
  default     = 60
}

variable "drain_max_seconds" {
  description = "deploy.sh waits at most this long for live rooms to reach 0 when the relay offers a drain endpoint."
  type        = number
  default     = 1800
}

variable "autoheal_initial_delay_seconds" {
  type    = number
  default = 120
}

variable "labels" {
  type    = map(string)
  default = {}
}
