resource "google_cloud_run_v2_service" "this" {
  provider             = google-beta
  project              = var.project_id
  name                 = var.name
  location             = var.region
  ingress              = var.ingress
  default_uri_disabled = true
  # Reached only through the load balancer (ingress above), which carries no Google identity, so the invoker check
  # is off instead of granting run.invoker to allUsers. Cloud Armor admits Cloudflare only.
  invoker_iam_disabled = true
  deletion_protection  = var.deletion_protection
  labels               = var.labels

  template {
    service_account                  = var.service_account
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    timeout                          = "${var.timeout_seconds}s"
    max_instance_request_concurrency = var.concurrency
    labels                           = var.labels

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    vpc_access {
      egress = "ALL_TRAFFIC"
      network_interfaces {
        network    = var.network
        subnetwork = var.subnetwork
      }
    }

    containers {
      image = var.image

      ports {
        container_port = var.port
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        cpu_idle          = !var.cpu_always_allocated
        startup_cpu_boost = var.startup_cpu_boost
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

      dynamic "startup_probe" {
        for_each = var.startup_probe_path == null ? [] : [var.startup_probe_path]
        content {
          period_seconds    = 5
          timeout_seconds   = 3
          failure_threshold = 24
          http_get {
            path = startup_probe.value
            port = var.port
          }
        }
      }

      dynamic "startup_probe" {
        for_each = var.startup_probe_path == null ? [1] : []
        content {
          period_seconds    = 5
          timeout_seconds   = 3
          failure_threshold = 24
          tcp_socket {
            port = var.port
          }
        }
      }

      dynamic "liveness_probe" {
        for_each = var.liveness_probe_path == null ? [] : [var.liveness_probe_path]
        content {
          period_seconds    = 30
          timeout_seconds   = 5
          failure_threshold = 3
          http_get {
            path = liveness_probe.value
            port = var.port
          }
        }
      }
    }
  }

  lifecycle {
    # CI (deploy-gcp.yml) owns the running image, tagged revisions and traffic. deploy-run.sh leaves traffic on LATEST,
    # so a revision an apply creates here (secret pin, env, sizing) serves as soon as it is ready.
    ignore_changes = [
      template[0].containers[0].image,
      template[0].revision,
      template[0].labels["commit-sha"],
      traffic,
      client,
      client_version,
    ]
  }
}

output "name" {
  value = google_cloud_run_v2_service.this.name
}

output "id" {
  value = google_cloud_run_v2_service.this.id
}

output "settings" {
  description = "Key settings (for tests and review)."
  value = {
    location             = google_cloud_run_v2_service.this.location
    ingress              = google_cloud_run_v2_service.this.ingress
    default_uri_disabled = google_cloud_run_v2_service.this.default_uri_disabled
    invoker_iam_disabled = google_cloud_run_v2_service.this.invoker_iam_disabled
    min_instances        = var.min_instances
    max_instances        = var.max_instances
    cpu_idle             = !var.cpu_always_allocated
    concurrency          = var.concurrency
    timeout_seconds      = var.timeout_seconds
    env                  = var.env
    secret_names         = sort(keys(var.secret_env))
    egress               = "ALL_TRAFFIC"
    service_account      = var.service_account
  }
}
