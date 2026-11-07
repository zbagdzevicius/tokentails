# A Cloud Run job run by hand (gcloud run jobs execute), e.g. tt-migrate: `npx migrate-mongo up` in the backend image.
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
  type = string
}

variable "command" {
  type    = list(string)
  default = null
}

variable "args" {
  type    = list(string)
  default = null
}

variable "service_account" {
  type = string
}

variable "env" {
  type    = map(string)
  default = {}
}

variable "secret_env" {
  type = map(object({
    secret  = string
    version = string
  }))
  default = {}
}

variable "network" {
  type = string
}

variable "subnetwork" {
  type = string
}

variable "timeout_seconds" {
  type    = number
  default = 1800
}

variable "deletion_protection" {
  type    = bool
  default = true
}

resource "google_cloud_run_v2_job" "this" {
  project             = var.project_id
  name                = var.name
  location            = var.region
  deletion_protection = var.deletion_protection

  template {
    task_count = 1

    template {
      service_account = var.service_account
      timeout         = "${var.timeout_seconds}s"
      max_retries     = 0

      vpc_access {
        egress = "ALL_TRAFFIC"
        network_interfaces {
          network    = var.network
          subnetwork = var.subnetwork
        }
      }

      containers {
        image   = var.image
        command = var.command
        args    = var.args

        resources {
          limits = {
            cpu    = "1"
            memory = "1Gi"
          }
        }

        dynamic "env" {
          for_each = var.env
          content {
            name  = env.key
            value = env.value
          }
        }

        dynamic "env" {
          for_each = var.secret_env
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = env.value.secret
                version = env.value.version
              }
            }
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }
}

output "name" {
  value = google_cloud_run_v2_job.this.name
}
