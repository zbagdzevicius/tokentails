# Token Tails on Google Cloud, production (infra/gcp/RUNBOOK.md). One region, Cloudflare in front:
#   Cloudflare -> regional external ALB (Cloud Armor: Cloudflare only)
#     api.*      -> Cloud Run tt-api (BACKEND_ROLE=api), /pawlegends/ws -> relay VM (BACKEND_ROLE=relay)
#     tokentails.com, www -> Cloud Run tt-web;  cats.* -> Cloud Run tt-cms
#   egress -> Cloud NAT (one static IP on the MongoDB Atlas access list)

locals {
  service_accounts = {
    "sa-api" = {
      display_name  = "tt-api runtime (Cloud Run)"
      project_roles = ["roles/logging.logWriter", "roles/monitoring.metricWriter"]
    }
    "sa-relay" = {
      display_name  = "party relay VM"
      project_roles = ["roles/logging.logWriter", "roles/monitoring.metricWriter"]
    }
    "sa-web" = {
      display_name  = "tt-web runtime (Cloud Run)"
      project_roles = ["roles/logging.logWriter", "roles/monitoring.metricWriter"]
    }
    "sa-cms" = {
      display_name  = "tt-cms runtime (Cloud Run)"
      project_roles = ["roles/logging.logWriter", "roles/monitoring.metricWriter"]
    }
    "sa-migrate" = {
      display_name  = "tt-migrate job (migrate-mongo)"
      project_roles = ["roles/logging.logWriter"]
    }
    "sa-deploy" = {
      display_name = "GitHub Actions deploy (deploy-gcp.yml)"
      project_roles = [
        "roles/run.developer",
        "projects/${var.project_id}/roles/ttRelayDeployer",
      ]
    }
    "sa-tf-plan" = {
      display_name  = "GitHub Actions terraform plan (read only)"
      project_roles = ["roles/viewer", "roles/iam.securityReviewer"]
    }
  }

  labels = {
    app        = "tokentails"
    env        = var.environment
    managed-by = "terraform"
  }

  api_hosts = coalesce(var.api_hosts, ["api.${var.domain}", "gcp-api.${var.domain}"])
  web_hosts = coalesce(var.web_hosts, [var.domain, "www.${var.domain}", "gcp.${var.domain}"])
  cms_hosts = coalesce(var.cms_hosts, ["cats.${var.domain}"])

  registry      = module.artifact_registry.repository_url
  backend_image = "${local.registry}/backend:${var.backend_tag}"
  web_image     = "${local.registry}/web:${var.web_tag}"
  cms_image     = "${local.registry}/cms:${var.cms_tag}"
  relay_port    = 8080
  # Emails are derived, not read from the account resources, so every for_each key below is known at plan time
  # (secret, registry and bucket bindings). Modules that bind them depend on module.service_accounts.
  sa             = { for id in keys(local.service_accounts) : id => "${id}@${var.project_id}.iam.gserviceaccount.com" }
  sa_id          = { for id, email in local.sa : id => "projects/${var.project_id}/serviceAccounts/${email}" }
  all_secret_ids = distinct(concat(var.do_secret_keys, var.extra_secret_keys))

  api_secret_versions = coalesce(var.api_secret_versions, { for k in var.do_secret_keys : k => "1" })

  # Who reads which secret. sa-api reads everything it may mount; the relay and the migration job only theirs;
  # web, cms and CI read none. Hot-wallet keys: sa-api only (checked below and in tests).
  secret_readers = {
    for k in local.all_secret_ids : k => compact([
      local.sa["sa-api"],
      contains(var.relay_secret_keys, k) && !contains(var.hot_wallet_secret_keys, k) ? local.sa["sa-relay"] : "",
      k == "MONGODB_URI" ? local.sa["sa-migrate"] : "",
    ])
  }
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
  source     = "../../modules/network"
  project_id = var.project_id
  region     = var.region
  relay_port = local.relay_port

  depends_on = [module.project_services]
}

module "service_accounts" {
  source     = "../../modules/service_accounts"
  project_id = var.project_id
  accounts   = local.service_accounts

  depends_on = [module.project_services, google_project_iam_custom_role.relay_deployer]
}

# What the relay deploy needs on the MIG: update its all-instances metadata (the image) and refresh instances. No
# create or delete rights, no access to other resources' data.
resource "google_project_iam_custom_role" "relay_deployer" {
  project     = var.project_id
  role_id     = "ttRelayDeployer"
  title       = "Token Tails relay deployer"
  description = "Set the relay image metadata on the MIG and reach the VM over IAP SSH."
  permissions = [
    "compute.instanceGroupManagers.get",
    "compute.instanceGroupManagers.update",
    "compute.instanceGroups.get",
    "compute.instanceGroups.list",
    "compute.instances.get",
    "compute.instances.list",
    "compute.instances.setMetadata",
    "compute.projects.get",
    "compute.regionOperations.get",
    "compute.zoneOperations.get",
  ]

  depends_on = [module.project_services]
}

# sa-deploy reaches the relay VM only: IAP TCP forwarding on port 22 and OS Login (sudo for deploy.sh) on tt-relay
# instances. The MIG recreates the VM under new names, so the binding is a project one narrowed by a condition.
resource "google_project_iam_member" "deploy_iap_ssh" {
  project    = var.project_id
  depends_on = [module.service_accounts]
  role       = "roles/iap.tunnelResourceAccessor"
  member     = "serviceAccount:${local.sa["sa-deploy"]}"

  condition {
    title       = "relay-ssh-only"
    description = "IAP TCP forwarding to port 22 only."
    expression  = "destination.port == 22"
  }
}

resource "google_project_iam_member" "deploy_os_login" {
  project    = var.project_id
  depends_on = [module.service_accounts]
  role       = "roles/compute.osAdminLogin"
  member     = "serviceAccount:${local.sa["sa-deploy"]}"

  condition {
    title       = "relay-vm-only"
    description = "OS Login with sudo on the party relay VMs only."
    expression  = "resource.type == 'compute.googleapis.com/Instance' && resource.name.extract('/instances/{name}').startsWith('${var.relay_name}')"
  }
}

# sa-deploy deploys revisions that run as these accounts and SSHes into the VM that runs as sa-relay.
resource "google_service_account_iam_member" "deploy_acts_as" {
  for_each           = toset(["sa-api", "sa-web", "sa-cms", "sa-migrate", "sa-relay"])
  depends_on         = [module.service_accounts]
  service_account_id = local.sa_id[each.value]
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${local.sa["sa-deploy"]}"
}

module "artifact_registry" {
  source     = "../../modules/artifact_registry"
  project_id = var.project_id
  region     = var.region
  writers    = [local.sa["sa-deploy"]]
  readers    = [local.sa["sa-relay"]]

  depends_on = [module.project_services, module.service_accounts]
}

module "secrets" {
  source     = "../../modules/secrets"
  project_id = var.project_id
  region     = var.region
  secrets    = local.secret_readers
  labels     = local.labels

  depends_on = [module.project_services, module.service_accounts]
}

# Private bucket for new uploads, served later through cdn.<domain> (RUNBOOK.md "Later"). Off until that step:
# DigitalOcean Spaces stays the media store and its URLs never change.
module "static_assets" {
  source      = "../../modules/static_assets"
  count       = var.static_bucket_enabled ? 1 : 0
  project_id  = var.project_id
  region      = var.region
  bucket_name = "${var.project_id}-media"
  writers     = [local.sa["sa-api"]]
  labels      = local.labels

  depends_on = [module.project_services, module.service_accounts]
}

# ---------------------------------------------------------------------------------------------------------------------
# Compute

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

  env = {
    NODE_ENV     = "production"
    BACKEND_ROLE = "api"
    NO_COLOR     = "1"
  }

  secret_env = { for k, v in local.api_secret_versions : k => { secret = module.secrets.ids[k], version = v } }

  depends_on = [module.secrets]
}

module "web" {
  source             = "../../modules/cloud_run_service"
  project_id         = var.project_id
  region             = var.region
  name               = "tt-web"
  image              = local.web_image
  service_account    = local.sa["sa-web"]
  cpu                = var.web.cpu
  memory             = var.web.memory
  min_instances      = var.web.min_instances
  max_instances      = var.web.max_instances
  concurrency        = 80
  timeout_seconds    = 60
  startup_probe_path = null
  network            = module.network.network_id
  subnetwork         = module.network.subnet_id
  labels             = local.labels

  env = {
    NODE_ENV                = "production"
    HOSTNAME                = "0.0.0.0"
    NEXT_TELEMETRY_DISABLED = "1"
  }
}

module "cms" {
  source             = "../../modules/cloud_run_service"
  project_id         = var.project_id
  region             = var.region
  name               = "tt-cms"
  image              = local.cms_image
  service_account    = local.sa["sa-cms"]
  cpu                = var.cms.cpu
  memory             = var.cms.memory
  min_instances      = var.cms.min_instances
  max_instances      = var.cms.max_instances
  concurrency        = 80
  timeout_seconds    = 60
  startup_probe_path = null
  network            = module.network.network_id
  subnetwork         = module.network.subnet_id
  labels             = local.labels

  env = {
    NODE_ENV                = "production"
    HOSTNAME                = "0.0.0.0"
    NEXT_TELEMETRY_DISABLED = "1"
  }
}

module "migrate" {
  source          = "../../modules/cloud_run_job"
  project_id      = var.project_id
  region          = var.region
  name            = "tt-migrate"
  image           = local.backend_image
  command         = ["npx"]
  args            = ["migrate-mongo", "up"]
  service_account = local.sa["sa-migrate"]
  network         = module.network.network_id
  subnetwork      = module.network.subnet_id
  env             = { NODE_ENV = "production" }
  secret_env      = { MONGODB_URI = { secret = module.secrets.ids["MONGODB_URI"], version = local.api_secret_versions["MONGODB_URI"] } }

  depends_on = [module.secrets]
}

module "relay_vm" {
  source          = "../../modules/relay_vm"
  name            = var.relay_name
  project_id      = var.project_id
  region          = var.region
  zones           = var.zones
  machine_type    = var.relay_machine_type
  network         = module.network.network_id
  subnetwork      = module.network.subnet_id
  service_account = local.sa["sa-relay"]
  port            = local.relay_port
  initial_image   = local.backend_image
  plain_env       = { NO_COLOR = "1" }
  secrets         = { for k, v in var.relay_secret_versions : k => v if contains(var.relay_secret_keys, k) }
  labels          = local.labels

  depends_on = [module.secrets, module.artifact_registry]
}

# ---------------------------------------------------------------------------------------------------------------------
# Edge

module "edge" {
  source                   = "../../modules/edge_lb_regional"
  project_id               = var.project_id
  region                   = var.region
  network                  = module.network.network_id
  proxy_only_subnet_id     = module.network.proxy_only_subnet_id
  api_hosts                = local.api_hosts
  web_hosts                = local.web_hosts
  cms_hosts                = local.cms_hosts
  api_service              = module.api.name
  web_service              = module.web.name
  cms_service              = module.cms.name
  relay_instance_group     = module.relay_vm.instance_group
  relay_health_check       = module.relay_vm.lb_health_check_id
  cloudflare_ipv4          = var.cloudflare_ipv4
  cloudflare_ipv6          = var.cloudflare_ipv6
  ws_rate_limit_per_minute = var.ws_rate_limit_per_minute
}

# ---------------------------------------------------------------------------------------------------------------------
# CI, observability, budget

module "wif" {
  source                    = "../../modules/wif_github"
  project_id                = var.project_id
  repository                = var.github_repository
  repository_id             = var.github_repository_id
  deploy_service_account_id = local.sa_id["sa-deploy"]
  extra_bindings = merge(
    { plan = { service_account_id = local.sa_id["sa-tf-plan"], environment = "gcp-plan" } },
    var.ci_apply_enabled ? { apply = { service_account_id = google_service_account.tf_apply[0].id, environment = "gcp-prod" } } : {}
  )

  depends_on = [module.project_services, module.service_accounts]
}

# Optional: the environment-gated `terraform apply` job (terraform.yml). Broad rights by nature, so off by default.
resource "google_service_account" "tf_apply" {
  count        = var.ci_apply_enabled ? 1 : 0
  project      = var.project_id
  account_id   = "sa-tf-apply"
  display_name = "GitHub Actions terraform apply (environment gcp-prod, reviewers required)"
}

resource "google_project_iam_member" "tf_apply" {
  for_each = var.ci_apply_enabled ? toset([
    "roles/editor", "roles/resourcemanager.projectIamAdmin", "roles/secretmanager.admin",
    "roles/iam.workloadIdentityPoolAdmin", "roles/run.admin", "roles/compute.securityAdmin",
  ]) : toset([])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.tf_apply[0].email}"
}

resource "google_storage_bucket_iam_member" "state_reader" {
  count  = var.state_bucket == null ? 0 : 1
  bucket = var.state_bucket
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${local.sa["sa-tf-plan"]}"
}

resource "google_storage_bucket_iam_member" "state_writer" {
  count  = var.state_bucket != null && var.ci_apply_enabled ? 1 : 0
  bucket = var.state_bucket
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.tf_apply[0].email}"
}

module "monitoring" {
  source                = "../../modules/monitoring"
  project_id            = var.project_id
  alert_email           = var.alert_email
  api_service           = module.api.name
  api_max_instances     = var.api.max_instances
  relay_instance_prefix = var.relay_name
  max_live_rooms        = var.max_live_rooms
  api_host              = local.api_hosts[0]
  web_host              = local.web_hosts[0]

  depends_on = [module.project_services]
}

module "budget" {
  source                = "../../modules/budget"
  billing_account       = var.billing_account
  project_number        = data.google_project.this.number
  amount                = var.budget_amount
  currency_code         = var.budget_currency
  notification_channels = [module.monitoring.notification_channel]

  depends_on = [module.project_services]
}
