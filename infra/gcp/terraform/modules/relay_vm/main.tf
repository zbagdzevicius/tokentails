locals {
  registry_host = "${var.region}-docker.pkg.dev"
  plain_env = merge(var.plain_env, {
    NODE_ENV     = "production"
    BACKEND_ROLE = "relay"
    PORT         = tostring(var.port)
  })
  cloud_init = templatefile("${path.module}/templates/cloud-init.yaml.tftpl", {
    port                 = var.port
    registry_host        = local.registry_host
    image_metadata_key   = var.image_metadata_key
    plain_env            = local.plain_env
    secrets              = var.secrets
    stop_timeout_seconds = var.stop_timeout_seconds
    drain_max_seconds    = var.drain_max_seconds
  })
}

resource "google_compute_instance_template" "relay" {
  project      = var.project_id
  name_prefix  = "${var.name}-"
  region       = var.region
  machine_type = var.machine_type
  tags         = [var.network_tag]
  labels       = var.labels

  disk {
    source_image = var.image_family
    disk_type    = "pd-balanced"
    disk_size_gb = var.boot_disk_gb
    boot         = true
    auto_delete  = true
  }

  # No external IP: egress through Cloud NAT, ingress only from the load balancer and health checkers.
  network_interface {
    network    = var.network
    subnetwork = var.subnetwork
  }

  service_account {
    email  = var.service_account
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]
  }

  scheduling {
    on_host_maintenance = "MIGRATE"
    automatic_restart   = true
    preemptible         = false
    provisioning_model  = "STANDARD"
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  metadata = {
    user-data                 = local.cloud_init
    google-logging-enabled    = "true"
    google-monitoring-enabled = "true"
    enable-oslogin            = "TRUE"
    block-project-ssh-keys    = "true"
    serial-port-enable        = "false"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Autohealing: lenient (60 s of failures) so a slow restore or a Mongo blip never recreates the VM mid-match.
resource "google_compute_region_health_check" "autoheal" {
  project             = var.project_id
  name                = "${var.name}-autoheal"
  region              = var.region
  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 6

  http_health_check {
    port         = var.port
    request_path = "/healthz"
  }
}

# Load balancer health: GET /healthz on the relay port.
resource "google_compute_region_health_check" "lb" {
  project             = var.project_id
  name                = "${var.name}-lb"
  region              = var.region
  check_interval_sec  = 5
  timeout_sec         = 4
  healthy_threshold   = 2
  unhealthy_threshold = 3

  http_health_check {
    port         = var.port
    request_path = "/healthz"
  }
}

resource "google_compute_region_instance_group_manager" "relay" {
  project                          = var.project_id
  name                             = var.name
  region                           = var.region
  base_instance_name               = var.name
  target_size                      = 1
  distribution_policy_zones        = var.zones
  distribution_policy_target_shape = "EVEN"
  wait_for_instances               = false

  version {
    name              = "primary"
    instance_template = google_compute_instance_template.relay.id
  }

  named_port {
    name = "http"
    port = var.port
  }

  auto_healing_policies {
    health_check      = google_compute_region_health_check.autoheal.id
    initial_delay_sec = var.autoheal_initial_delay_seconds
  }

  # One relay owns every party: never two at once (no surge), replace in place.
  update_policy {
    type                           = "OPPORTUNISTIC"
    minimal_action                 = "REPLACE"
    replacement_method             = "RECREATE"
    max_surge_fixed                = 0
    max_unavailable_fixed          = length(var.zones)
    instance_redistribution_type   = "NONE"
    most_disruptive_allowed_action = "REPLACE"
  }

  instance_lifecycle_policy {
    force_update_on_repair    = "YES"
    default_action_on_failure = "REPAIR"
  }

  # The image to run, applied to every instance the MIG creates (autoheal included). CI updates it with
  # `gcloud compute instance-groups managed all-instances-config update` before running deploy.sh.
  all_instances_config {
    metadata = {
      (var.image_metadata_key) = var.initial_image
    }
  }

  lifecycle {
    ignore_changes = [all_instances_config]
  }
}
