terraform {
  required_version = ">= 1.9"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
    # Self-signed certificate for the load balancer (no DNS on a throwaway stack). Its key lives in staging state only.
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

# Every resource lands in var.project_id, which must be tokentails-staging (variables.tf).
provider "google" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
  default_labels        = local.labels
}

provider "google-beta" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
  default_labels        = local.labels
}
