# APIs the Token Tails stack needs. disable_on_destroy = false: removing one from this list never turns an API off
# under running services.
variable "project_id" {
  type = string
}

variable "services" {
  type = list(string)
  default = [
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "certificatemanager.googleapis.com",
    "cloudbilling.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "iap.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "oslogin.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "serviceusage.googleapis.com",
    "sts.googleapis.com",
  ]
}

resource "google_project_service" "this" {
  for_each                   = toset(var.services)
  project                    = var.project_id
  service                    = each.value
  disable_on_destroy         = false
  disable_dependent_services = false
}

output "enabled" {
  description = "Enabled services (depend on this before creating resources)."
  value       = [for s in google_project_service.this : s.service]
}
