# Secret Manager containers and per-secret access. NO secret versions here, ever: the founder adds each value with
#   printf '%s' "$VALUE" | gcloud secrets versions add NAME --data-file=- --project=PROJECT
# in their own terminal (infra/gcp/RUNBOOK.md). Terraform state therefore never holds a secret value.
variable "project_id" {
  type = string
}

variable "region" {
  description = "Secrets are stored in this region only (user-managed replication)."
  type        = string
}

variable "secrets" {
  description = "Secret name (the env var name) => service account emails that may read it."
  type        = map(list(string))

  validation {
    condition     = alltrue([for k in keys(var.secrets) : can(regex("^[A-Z][A-Z0-9_]{0,254}$", k))])
    error_message = "Secret names are env var names: upper case, digits and underscores."
  }
}

variable "labels" {
  type    = map(string)
  default = {}
}

variable "audit_data_access" {
  description = "Data Access audit logs (DATA_READ) for Secret Manager: every secret read is logged."
  type        = bool
  default     = true
}

resource "google_secret_manager_secret" "this" {
  for_each  = var.secrets
  project   = var.project_id
  secret_id = each.key
  labels    = var.labels

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

locals {
  access = merge([
    for name, readers in var.secrets : {
      for email in readers : "${name}|${email}" => { name = name, email = email }
    }
  ]...)
}

resource "google_secret_manager_secret_iam_member" "accessor" {
  for_each  = local.access
  project   = var.project_id
  secret_id = google_secret_manager_secret.this[each.value.name].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${each.value.email}"
}

resource "google_project_iam_audit_config" "secret_manager" {
  count   = var.audit_data_access ? 1 : 0
  project = var.project_id
  service = "secretmanager.googleapis.com"

  audit_log_config {
    log_type = "DATA_READ"
  }

  audit_log_config {
    log_type = "ADMIN_READ"
  }
}

output "ids" {
  value = { for k, s in google_secret_manager_secret.this : k => s.id }
}

output "names" {
  value = sort(keys(google_secret_manager_secret.this))
}

output "accessors" {
  description = "Secret name => readers (for tests and review)."
  value       = { for k, v in var.secrets : k => sort(v) }
}
