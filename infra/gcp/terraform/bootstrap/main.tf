# One-time bootstrap, run by the founder in their own terminal with local state (RUNBOOK.md step 1):
#   terraform init && terraform apply -var project_id=tokentails-prod
# It creates only the versioned, private Terraform state bucket. Everything else lives in ../envs/prod.
terraform {
  required_version = ">= 1.9"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

variable "project_id" {
  type = string

  validation {
    condition     = can(regex("^tokentails-[a-z0-9-]{1,19}$", var.project_id)) && var.project_id != "motored-497708"
    error_message = "project_id must be a tokentails-* project. motored-497708 and any other project are refused."
  }
}

variable "region" {
  type    = string
  default = "europe-west3"
}

variable "bucket_name" {
  description = "null: <project_id>-tfstate."
  type        = string
  default     = null
}

provider "google" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}

resource "google_project_service" "storage" {
  project            = var.project_id
  service            = "storage.googleapis.com"
  disable_on_destroy = false
}

# Waiver: Google-managed encryption. CMEK adds a KMS key ring, rotation and an outage mode for no gain at this
# scale; nothing in this bucket is a secret value (state holds names and settings only, never secret versions).
#trivy:ignore:GCP-0066
resource "google_storage_bucket" "state" {
  #checkov:skip=CKV_GCP_62:Access logs to a second bucket add a bucket to secure for a single-writer state bucket; Admin Activity audit logs already record IAM and bucket changes.
  project                     = var.project_id
  name                        = coalesce(var.bucket_name, "${var.project_id}-tfstate")
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  soft_delete_policy {
    retention_duration_seconds = 604800
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 30
      with_state         = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }

  labels = {
    app        = "tokentails"
    managed-by = "terraform"
    purpose    = "tfstate"
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.storage]
}

output "state_bucket" {
  value = google_storage_bucket.state.name
}

output "backend_config" {
  description = "terraform init flags for envs/prod."
  value       = "-backend-config=bucket=${google_storage_bucket.state.name} -backend-config=prefix=envs/prod"
}
