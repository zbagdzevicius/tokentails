# Token Tails on Google Cloud, THROWAWAY staging stack in tokentails-staging (RUNBOOK.md "Staging"). It reuses the
# production modules to prove the setup works end to end, then everything is destroyed. Differences from envs/prod:
#   - no DNS, no Cloudflare: fake *.staging.tokentails.test hosts, a self-signed certificate, plain HTTP on :80 too,
#     and Cloud Armor admits the operator's own /32 besides the Cloudflare ranges (default rule still deny 403);
#   - MongoDB is a throwaway mongo:7 VM inside the VPC (no auth, reachable from the subnet only), never Atlas;
#   - no CI (no WIF, deploy or plan accounts), no custom roles, monitoring and budget optional;
#   - deletion protection off, force_destroy on, small sizes, one zone.
# Secret values are throwaway (scripts/staging-secrets.sh); Terraform still creates containers and IAM only.

locals {
  service_accounts = {
    "sa-api" = {
      display_name  = "tt-api runtime (Cloud Run, staging)"
      project_roles = ["roles/logging.logWriter", "roles/monitoring.metricWriter"]
    }
    "sa-relay" = {
      display_name  = "party relay VM (staging)"
      project_roles = ["roles/logging.logWriter", "roles/monitoring.metricWriter"]
    }
    "sa-web" = {
      display_name  = "tt-web runtime (Cloud Run, staging)"
      project_roles = ["roles/logging.logWriter", "roles/monitoring.metricWriter"]
    }
    "sa-cms" = {
      display_name  = "tt-cms runtime (Cloud Run, staging)"
      project_roles = ["roles/logging.logWriter", "roles/monitoring.metricWriter"]
    }
    "sa-migrate" = {
      display_name  = "tt-migrate job (staging)"
      project_roles = ["roles/logging.logWriter"]
    }
    "sa-mongo" = {
      display_name  = "throwaway mongo:7 VM (staging)"
      project_roles = ["roles/logging.logWriter"]
    }
  }

  labels = {
    app        = "tokentails"
    env        = var.environment
    managed-by = "terraform"
  }

  subnet_cidr = "10.10.0.0/20"
  api_hosts   = ["api.${var.domain}"]
  web_hosts   = [var.domain, "www.${var.domain}"]
  cms_hosts   = ["cats.${var.domain}"]
  all_hosts   = concat(local.api_hosts, local.web_hosts, local.cms_hosts)

  registry      = module.artifact_registry.repository_url
  backend_image = "${local.registry}/backend:${var.backend_tag}"
  web_image     = "${local.registry}/web:${var.web_tag}"
  cms_image     = "${local.registry}/cms:${var.cms_tag}"
  relay_port    = 8080

  sa = { for id in keys(local.service_accounts) : id => "${id}@${var.project_id}.iam.gserviceaccount.com" }

  # Every staging secret at version 1 (scripts/staging-secrets.sh adds exactly one throwaway version each).
  api_secret_versions   = { for k in var.secret_keys : k => "1" }
  relay_secret_versions = { for k in var.relay_secret_keys : k => "1" if contains(var.secret_keys, k) }

  secret_readers = {
    for k in var.secret_keys : k => compact([
      local.sa["sa-api"],
      contains(var.relay_secret_keys, k) && !contains(var.hot_wallet_secret_keys, k) ? local.sa["sa-relay"] : "",
      k == "MONGODB_URI" ? local.sa["sa-migrate"] : "",
    ])
  }

  mongo_uri = "mongodb://${var.mongo_ip}:27017/tokentails"
}

check "hot_wallet_only_api" {
  assert {
    condition = alltrue([
      for k in var.hot_wallet_secret_keys : !contains(keys(local.secret_readers), k) || (length(local.secret_readers[k]) == 1 && local.secret_readers[k][0] == local.sa["sa-api"])
    ])
    error_message = "A hot-wallet secret is readable by something other than sa-api."
  }
}

data "google_project" "this" {
  project_id = var.project_id
}

module "project_services" {
  source     = "../../modules/project_services"
  project_id = var.project_id
}

module "network" {
  source      = "../../modules/network"
  project_id  = var.project_id
  region      = var.region
  subnet_cidr = local.subnet_cidr
  relay_port  = local.relay_port

  depends_on = [module.project_services]
}

module "service_accounts" {
  source     = "../../modules/service_accounts"
  project_id = var.project_id
  accounts   = local.service_accounts

  depends_on = [module.project_services]
}

module "artifact_registry" {
  source     = "../../modules/artifact_registry"
  project_id = var.project_id
  region     = var.region
  # The operator pushes with their own (owner) credentials; no CI writer on staging.
  writers = []
  readers = [local.sa["sa-relay"]]

  depends_on = [module.project_services, module.service_accounts]
}

module "secrets" {
  source            = "../../modules/secrets"
  project_id        = var.project_id
  region            = var.region
  secrets           = local.secret_readers
  labels            = local.labels
  audit_data_access = false

  depends_on = [module.project_services, module.service_accounts]
}

module "static_assets" {
  source        = "../../modules/static_assets"
  count         = var.static_bucket_enabled ? 1 : 0
  project_id    = var.project_id
  region        = var.region
  bucket_name   = "${var.project_id}-media"
  writers       = [local.sa["sa-api"]]
  labels        = local.labels
  force_destroy = true

  depends_on = [module.project_services, module.service_accounts]
}

# ---------------------------------------------------------------------------------------------------------------------
# Throwaway MongoDB: mongo:7 in Docker on a small Container-Optimized OS VM. No external IP, no auth, port 27017 open
# to the main subnet only (Cloud Run direct VPC egress and the relay). Data dies with the VM.

resource "google_compute_address" "mongo" {
  project      = var.project_id
  name         = "tt-mongo-internal"
  region       = var.region
  address_type = "INTERNAL"
  subnetwork   = module.network.subnet_id
  address      = var.mongo_ip
}

# Waiver: Google-managed disk encryption. A throwaway staging database with test data only, destroyed after the test;
# CMEK or CSEK adds a key to manage for nothing.
#trivy:ignore:GCP-0033
resource "google_compute_instance" "mongo" {
  #checkov:skip=CKV_GCP_38:Throwaway staging VM with test data only, destroyed the same day; Google-managed encryption.
  project                   = var.project_id
  name                      = "tt-mongo"
  zone                      = var.zones[0]
  machine_type              = var.mongo_machine_type
  tags                      = ["tt-mongo"]
  labels                    = local.labels
  deletion_protection       = false
  allow_stopping_for_update = true

  boot_disk {
    auto_delete = true
    initialize_params {
      image = "projects/cos-cloud/global/images/family/cos-stable"
      size  = 20
      type  = "pd-balanced"
    }
  }

  network_interface {
    subnetwork = module.network.subnet_id
    network_ip = google_compute_address.mongo.address
  }

  service_account {
    email  = local.sa["sa-mongo"]
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  metadata = {
    user-data              = file("${path.module}/mongo-cloud-init.yaml")
    google-logging-enabled = "true"
    enable-oslogin         = "TRUE"
    block-project-ssh-keys = "true"
    serial-port-enable     = "false"
  }

  depends_on = [module.service_accounts]
}

resource "google_compute_firewall" "mongo_from_subnet" {
  project       = var.project_id
  name          = "tt-staging-allow-mongo"
  network       = module.network.network_id
  direction     = "INGRESS"
  priority      = 1000
  source_ranges = [local.subnet_cidr]
  target_tags   = ["tt-mongo"]

  allow {
    protocol = "tcp"
    ports    = ["27017"]
  }
}

resource "google_compute_firewall" "mongo_iap_ssh" {
  project       = var.project_id
  name          = "tt-staging-allow-iap-ssh-mongo"
  network       = module.network.network_id
  direction     = "INGRESS"
  priority      = 1000
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["tt-mongo"]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

# ---------------------------------------------------------------------------------------------------------------------
# Compute (same modules and settings as production, smaller, deletion protection off)

module "api" {
  source               = "../../modules/cloud_run_service"
  project_id           = var.project_id
  region               = var.region
  name                 = "tt-api"
  image                = local.backend_image
  service_account      = local.sa["sa-api"]
  cpu                  = var.api.cpu
  memory               = var.api.memory
  cpu_always_allocated = true
  min_instances        = var.api.min_instances
  max_instances        = var.api.max_instances
  concurrency          = var.api.concurrency
  timeout_seconds      = 300
  startup_probe_path   = "/healthz"
  liveness_probe_path  = "/healthz"
  network              = module.network.network_id
  subnetwork           = module.network.subnet_id
  labels               = local.labels
  deletion_protection  = false

  env = merge(var.api_extra_env, {
    NODE_ENV     = "production"
    BACKEND_ROLE = "api"
    NO_COLOR     = "1"
  })

  secret_env = { for k, v in local.api_secret_versions : k => { secret = module.secrets.ids[k], version = v } }

  depends_on = [module.secrets, google_compute_instance.mongo]
}

module "web" {
  source              = "../../modules/cloud_run_service"
  project_id          = var.project_id
  region              = var.region
  name                = "tt-web"
  image               = local.web_image
  service_account     = local.sa["sa-web"]
  cpu                 = var.web.cpu
  memory              = var.web.memory
  min_instances       = var.web.min_instances
  max_instances       = var.web.max_instances
  concurrency         = 80
  timeout_seconds     = 60
  startup_probe_path  = null
  network             = module.network.network_id
  subnetwork          = module.network.subnet_id
  labels              = local.labels
  deletion_protection = false

  env = {
    NODE_ENV                = "production"
    HOSTNAME                = "0.0.0.0"
    NEXT_TELEMETRY_DISABLED = "1"
  }
}

module "cms" {
  source              = "../../modules/cloud_run_service"
  project_id          = var.project_id
  region              = var.region
  name                = "tt-cms"
  image               = local.cms_image
  service_account     = local.sa["sa-cms"]
  cpu                 = var.cms.cpu
  memory              = var.cms.memory
  min_instances       = var.cms.min_instances
  max_instances       = var.cms.max_instances
  concurrency         = 80
  timeout_seconds     = 60
  startup_probe_path  = null
  network             = module.network.network_id
  subnetwork          = module.network.subnet_id
  labels              = local.labels
  deletion_protection = false

  env = {
    NODE_ENV                = "production"
    HOSTNAME                = "0.0.0.0"
    NEXT_TELEMETRY_DISABLED = "1"
  }
}

module "migrate" {
  source              = "../../modules/cloud_run_job"
  project_id          = var.project_id
  region              = var.region
  name                = "tt-migrate"
  image               = local.backend_image
  command             = ["npx"]
  args                = ["migrate-mongo", "up"]
  service_account     = local.sa["sa-migrate"]
  network             = module.network.network_id
  subnetwork          = module.network.subnet_id
  env                 = { NODE_ENV = "production" }
  secret_env          = { MONGODB_URI = { secret = module.secrets.ids["MONGODB_URI"], version = local.api_secret_versions["MONGODB_URI"] } }
  deletion_protection = false

  depends_on = [module.secrets]
}

module "relay_vm" {
  source          = "../../modules/relay_vm"
  name            = "tt-relay"
  project_id      = var.project_id
  region          = var.region
  zones           = var.zones
  machine_type    = var.relay_machine_type
  network         = module.network.network_id
  subnetwork      = module.network.subnet_id
  service_account = local.sa["sa-relay"]
  port            = local.relay_port
  initial_image   = local.backend_image
  plain_env       = { NO_COLOR = "1", PARTY_MAX_LIVE_ROOMS = tostring(var.max_live_rooms) }
  secrets         = local.relay_secret_versions
  labels          = local.labels

  depends_on = [module.secrets, module.artifact_registry, google_compute_instance.mongo]
}

# ---------------------------------------------------------------------------------------------------------------------
# Edge: the production load balancer module with a self-signed certificate, an HTTP listener and the operator's /32.

resource "tls_private_key" "edge" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "tls_self_signed_cert" "edge" {
  private_key_pem       = tls_private_key.edge.private_key_pem
  dns_names             = local.all_hosts
  validity_period_hours = var.cert_validity_hours
  allowed_uses          = ["key_encipherment", "digital_signature", "server_auth"]

  subject {
    common_name  = local.api_hosts[0]
    organization = "Token Tails staging (self-signed, throwaway)"
  }
}

module "edge" {
  source                      = "../../modules/edge_lb_regional"
  project_id                  = var.project_id
  region                      = var.region
  network                     = module.network.network_id
  proxy_only_subnet_id        = module.network.proxy_only_subnet_id
  api_hosts                   = local.api_hosts
  web_hosts                   = local.web_hosts
  cms_hosts                   = local.cms_hosts
  api_service                 = module.api.name
  web_service                 = module.web.name
  cms_service                 = module.cms.name
  relay_instance_group        = module.relay_vm.instance_group
  relay_health_check          = module.relay_vm.lb_health_check_id
  cloudflare_ipv4             = var.cloudflare_ipv4
  cloudflare_ipv6             = var.cloudflare_ipv6
  log_sample_rate             = 1
  certificate_mode            = "self_managed"
  http_listener               = true
  extra_allowed_source_ranges = var.operator_cidrs
  self_managed_certificate = {
    certificate_pem = tls_self_signed_cert.edge.cert_pem
    private_key_pem = tls_private_key.edge.private_key_pem
  }
}

# ---------------------------------------------------------------------------------------------------------------------
# Optional: monitoring and budget

module "monitoring" {
  source                = "../../modules/monitoring"
  count                 = var.monitoring_enabled ? 1 : 0
  project_id            = var.project_id
  alert_email           = var.alert_email
  api_service           = module.api.name
  api_max_instances     = var.api.max_instances
  relay_instance_prefix = "tt-relay"
  max_live_rooms        = var.max_live_rooms
  api_host              = local.api_hosts[0]
  web_host              = local.web_hosts[0]

  depends_on = [module.project_services]
}

module "budget" {
  source                = "../../modules/budget"
  count                 = var.budget_enabled ? 1 : 0
  billing_account       = var.billing_account
  project_number        = data.google_project.this.number
  amount                = var.budget_amount
  currency_code         = "USD"
  display_name          = "Token Tails staging"
  notification_channels = var.monitoring_enabled ? [module.monitoring[0].notification_channel] : []

  depends_on = [module.project_services]
}

check "optional_inputs" {
  assert {
    condition     = (!var.monitoring_enabled || var.alert_email != null) && (!var.budget_enabled || var.billing_account != null)
    error_message = "monitoring_enabled needs alert_email; budget_enabled needs billing_account."
  }
}
