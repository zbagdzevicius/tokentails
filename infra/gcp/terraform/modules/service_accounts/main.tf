# One service account per workload, each with only the project roles it needs. Secret access is granted per secret
# (modules/secrets), image access per repository (modules/artifact_registry), deploy rights per resource (envs/prod).
variable "project_id" {
  type = string
}

variable "accounts" {
  description = "account_id => { display_name, project_roles }."
  type = map(object({
    display_name  = string
    project_roles = list(string)
  }))

  validation {
    condition = alltrue(flatten([
      for a in values(var.accounts) : [
        for r in a.project_roles : !contains(["roles/owner", "roles/editor"], r)
      ]
    ]))
    error_message = "No workload service account gets roles/owner or roles/editor."
  }
}

resource "google_service_account" "this" {
  for_each     = var.accounts
  project      = var.project_id
  account_id   = each.key
  display_name = each.value.display_name
}

locals {
  bindings = merge([
    for id, a in var.accounts : {
      for r in a.project_roles : "${id}|${r}" => { id = id, role = r }
    }
  ]...)
}

resource "google_project_iam_member" "this" {
  for_each = local.bindings
  project  = var.project_id
  role     = each.value.role
  member   = "serviceAccount:${google_service_account.this[each.value.id].email}"
}

output "emails" {
  value = { for id, sa in google_service_account.this : id => sa.email }
}

output "ids" {
  value = { for id, sa in google_service_account.this : id => sa.id }
}

output "project_roles" {
  description = "account_id => project roles (for tests and review)."
  value       = { for id, a in var.accounts : id => a.project_roles }
}
