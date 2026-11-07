variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "repository_id" {
  type    = string
  default = "tokentails"
}

variable "keep_tagged" {
  description = "Most recent image versions kept (rollback window)."
  type        = number
  default     = 15
}

variable "untagged_max_age_days" {
  type    = number
  default = 7
}

variable "writers" {
  description = "Service account emails that push images (CI)."
  type        = list(string)
  default     = []
}

variable "readers" {
  description = "Service account emails that pull images (the relay VM; Cloud Run pulls with its own service agent)."
  type        = list(string)
  default     = []
}

resource "google_artifact_registry_repository" "docker" {
  project                = var.project_id
  location               = var.region
  repository_id          = var.repository_id
  format                 = "DOCKER"
  description            = "Token Tails images (backend, web, cms)."
  cleanup_policy_dry_run = false

  docker_config {
    immutable_tags = true
  }

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = var.keep_tagged
    }
  }

  cleanup_policies {
    id     = "delete-untagged"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "${var.untagged_max_age_days * 86400}s"
    }
  }

  cleanup_policies {
    id     = "delete-old-tagged"
    action = "DELETE"
    condition {
      tag_state  = "TAGGED"
      older_than = "${30 * 86400}s"
    }
  }
}

resource "google_artifact_registry_repository_iam_member" "writer" {
  for_each   = toset(var.writers)
  project    = var.project_id
  location   = var.region
  repository = google_artifact_registry_repository.docker.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${each.value}"
}

resource "google_artifact_registry_repository_iam_member" "reader" {
  for_each   = toset(var.readers)
  project    = var.project_id
  location   = var.region
  repository = google_artifact_registry_repository.docker.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${each.value}"
}

output "repository_url" {
  description = "Image prefix, e.g. <url>/backend:<sha>."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker.repository_id}"
}

output "repository_id" {
  value = google_artifact_registry_repository.docker.repository_id
}
