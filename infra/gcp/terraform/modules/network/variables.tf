variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "name" {
  description = "VPC name."
  type        = string
  default     = "vpc-main"
}

variable "subnet_cidr" {
  description = "Primary subnet: the relay VM and Cloud Run direct VPC egress."
  type        = string
  default     = "10.10.0.0/20"
}

variable "proxy_only_cidr" {
  description = "Proxy-only subnet of the regional external Application Load Balancer (10.x, a trusted hop in backend/src/shared/trust-proxy.ts)."
  type        = string
  default     = "10.129.0.0/23"

  validation {
    condition     = startswith(var.proxy_only_cidr, "10.")
    error_message = "The proxy-only subnet must stay inside 10.0.0.0/8: the backend trusts that range as a proxy hop for cf-connecting-ip."
  }
}

variable "relay_tag" {
  description = "Network tag of the relay VM."
  type        = string
  default     = "tt-relay"
}

variable "relay_port" {
  type    = number
  default = 8080
}

variable "nat_min_ports_per_vm" {
  type    = number
  default = 1024
}

variable "flow_log_sampling" {
  description = "VPC flow log sampling on the main subnet (0 to 1)."
  type        = number
  default     = 0.1
}
