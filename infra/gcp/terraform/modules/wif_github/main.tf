# GitHub Actions -> Google Cloud without JSON keys. Only workflows of one repository on refs/heads/main can get a
# token at all (the provider's attribute condition); each binding below narrows it further: the deploy account to one
# workflow file (job_workflow_ref), the Terraform accounts to one GitHub environment each.
variable "project_id" {
  type = string
}

variable "pool_id" {
  type    = string
  default = "github"
}

variable "provider_id" {
  type    = string
  default = "github-actions"
}

variable "repository" {
  description = "owner/name (check with `git remote -v`)."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.repository))
    error_message = "repository is owner/name."
  }
}

variable "repository_id" {
  description = "Numeric GitHub repository id (stable across renames; empty to skip)."
  type        = string
  default     = ""
}

variable "ref" {
  type    = string
  default = "refs/heads/main"
}

variable "deploy_service_account_id" {
  description = "Full id (projects/.../serviceAccounts/...) of the account deploy workflows impersonate."
  type        = string
}

variable "deploy_workflow_ref" {
  description = "job_workflow_ref allowed to impersonate the deploy account: owner/repo/.github/workflows/<file>@refs/heads/main. Other workflows on main (and third-party actions they run) get no deploy rights."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/\\.github/workflows/[A-Za-z0-9_.-]+\\.ya?ml@refs/heads/[A-Za-z0-9_./-]+$", var.deploy_workflow_ref))
    error_message = "deploy_workflow_ref is owner/repo/.github/workflows/<file>.yml@refs/heads/<branch>."
  }
}

variable "extra_bindings" {
  description = "Static key => { service_account_id, environment }: jobs of that GitHub environment may impersonate it."
  type = map(object({
    service_account_id = string
    environment        = string
  }))
  default = {}
}

locals {
  condition = join(" && ", compact([
    "assertion.repository=='${var.repository}'",
    "assertion.ref=='${var.ref}'",
    var.repository_id == "" ? "" : "assertion.repository_id=='${var.repository_id}'",
  ]))
}

resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = var.pool_id
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  #checkov:skip=CKV_GCP_125:False positive: checkov cannot resolve local.condition, which pins assertion.repository, assertion.ref and assertion.repository_id (asserted in tests/prod.tftest.hcl wif_pinned_to_repo_and_main).
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = var.provider_id
  display_name                       = "GitHub OIDC"
  attribute_condition                = local.condition

  attribute_mapping = {
    "google.subject"         = "assertion.sub"
    "attribute.repository"   = "assertion.repository"
    "attribute.ref"          = "assertion.ref"
    "attribute.environment"  = "assertion.environment"
    "attribute.workflow_ref" = "assertion.job_workflow_ref"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "deploy" {
  service_account_id = var.deploy_service_account_id
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.workflow_ref/${var.deploy_workflow_ref}"
}

resource "google_service_account_iam_member" "environment" {
  for_each           = var.extra_bindings
  service_account_id = each.value.service_account_id
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.environment/${each.value.environment}"
}

output "provider_name" {
  description = "workload_identity_provider input of google-github-actions/auth."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deploy_member" {
  description = "Who may impersonate the deploy account (for tests and review)."
  value       = google_service_account_iam_member.deploy.member
}

output "attribute_condition" {
  value = google_iam_workload_identity_pool_provider.github.attribute_condition
}
