# terraform test for envs/prod with mocked providers: no credentials, no cloud calls. Run from envs/prod:
#   terraform init -backend=false && terraform test -test-directory=../../../tests
# (infra/gcp/scripts/preflight.sh does this.)

mock_provider "google" {
  mock_data "google_project" {
    defaults = {
      number = "123456789012"
    }
  }
}

mock_provider "google-beta" {}

variables {
  project_id      = "gleaming-medium-480114-g5"
  billing_account = "000000-000000-000000"
  alert_email     = "alerts@example.com"
  backend_tag     = "0000000"
  web_tag         = "0000000"
  cms_tag         = "0000000"
}

run "relay_vm_is_always_on_and_private" {
  command = apply

  assert {
    condition     = module.relay_vm.settings.target_size >= 1
    error_message = "The relay MIG must keep at least one VM."
  }
  assert {
    condition     = module.relay_vm.settings.max_surge_fixed == 0
    error_message = "Never two relays at once: rooms have a single owner."
  }
  assert {
    condition     = module.relay_vm.settings.on_host_maintenance == "MIGRATE"
    error_message = "Host maintenance must live-migrate the relay, not stop it."
  }
  assert {
    condition     = module.relay_vm.settings.external_ip == false
    error_message = "The relay VM has no external IP (egress through Cloud NAT)."
  }
  assert {
    condition     = module.relay_vm.settings.shielded
    error_message = "Shielded VM (secure boot) on the relay."
  }
  assert {
    condition     = module.relay_vm.settings.autoheal_delay >= 120
    error_message = "Autohealing must give a restore at least 120 s."
  }
  assert {
    condition     = module.relay_vm.settings.plain_env.NODE_ENV == "production" && module.relay_vm.settings.plain_env.BACKEND_ROLE == "relay"
    error_message = "The relay runs NODE_ENV=production and BACKEND_ROLE=relay."
  }
  assert {
    condition     = module.relay_vm.settings.machine_type == "t2d-standard-2"
    error_message = "Default relay machine is t2d-standard-2 (2 cores, no SMT)."
  }
  assert {
    condition     = !strcontains(module.relay_vm.cloud_init, "gce-container-declaration") && strcontains(module.relay_vm.cloud_init, "docker stop -t 60")
    error_message = "cloud-init runs the container from systemd (no konlet) and stops it with a 60 s grace."
  }
  assert {
    condition     = module.relay_vm.settings.update_type == "OPPORTUNISTIC"
    error_message = "A template change never replaces the relay by itself (scripts/replace-relay.sh does, in a quiet hour)."
  }
  assert {
    condition     = !strcontains(module.relay_vm.cloud_init, "MONGODB_URI") && !strcontains(module.relay_vm.cloud_init, "FRONT_END_URLS") && !strcontains(module.relay_vm.cloud_init, "NODE_ENV=production")
    error_message = "Secret pins and env live in project metadata, not in the instance template (they must reach the running VM)."
  }
  assert {
    condition     = strcontains(module.relay_vm.cloud_init, "project/attributes/tt-relay-env") && strcontains(module.relay_vm.cloud_init, "project/attributes/tt-relay-secrets")
    error_message = "prepare.sh reads the env and secret pins from project metadata at every start."
  }
  assert {
    condition     = strcontains(module.relay_vm.runtime_config.env, "BACKEND_ROLE=relay") && strcontains(module.relay_vm.runtime_config.env, "NODE_ENV=production")
    error_message = "The relay env (project metadata) sets BACKEND_ROLE=relay and NODE_ENV=production."
  }
  assert {
    condition     = module.relay_vm.runtime_config.secrets == "FRONT_END_URLS=1\nMONGODB_URI=1"
    error_message = "By default the relay follows tt-api's pins and has no ticket secret until party_ticket_secret_version is set."
  }
  assert {
    condition     = strcontains(module.relay_vm.cloud_init, "/var/lib/tt-relay/image") && strcontains(module.relay_vm.cloud_init, "deploy.sh current")
    error_message = "The VM runs the image deploy.sh verified (/var/lib/tt-relay/image), and CI reads the running one."
  }
}

run "ticket_secret_same_version_on_api_and_relay" {
  command = apply

  variables {
    party_ticket_secret_version = "3"
    api_secret_versions = {
      MONGODB_URI    = "1"
      FRONT_END_URLS = "2"
    }
  }

  assert {
    condition     = contains(module.api.settings.secret_names, "PAWLEGENDS_PARTY_TICKET_SECRET")
    error_message = "tt-api mounts the ticket secret (it mints tickets)."
  }
  assert {
    condition     = module.relay_vm.runtime_config.secrets == "FRONT_END_URLS=2\nMONGODB_URI=1\nPAWLEGENDS_PARTY_TICKET_SECRET=3"
    error_message = "The relay gets the same ticket version and follows tt-api's FRONT_END_URLS pin."
  }
}

run "ticket_secret_only_through_its_own_variable" {
  command = plan

  variables {
    api_secret_versions = { MONGODB_URI = "1", PAWLEGENDS_PARTY_TICKET_SECRET = "1" }
  }

  expect_failures = [var.api_secret_versions]
}

run "api_has_no_ticket_secret_until_set" {
  command = apply

  assert {
    condition     = !contains(module.api.settings.secret_names, "PAWLEGENDS_PARTY_TICKET_SECRET")
    error_message = "Without party_ticket_secret_version, no revision pins a version that does not exist yet."
  }
}

run "api_cpu_always_allocated_lb_only" {
  command = apply

  assert {
    condition     = module.api.settings.ingress == "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
    error_message = "tt-api is reachable through the load balancer only."
  }
  assert {
    condition     = module.api.settings.default_uri_disabled
    error_message = "tt-api has no run.app URL."
  }
  assert {
    condition     = module.api.settings.min_instances >= 1
    error_message = "tt-api keeps one instance warm (in-process leased crons)."
  }
  assert {
    condition     = module.api.settings.cpu_idle == false
    error_message = "tt-api CPU is always allocated (no throttling between requests)."
  }
  assert {
    condition     = module.api.settings.env.NODE_ENV == "production" && module.api.settings.env.BACKEND_ROLE == "api"
    error_message = "tt-api runs NODE_ENV=production and BACKEND_ROLE=api."
  }
  assert {
    condition     = module.api.settings.egress == "ALL_TRAFFIC"
    error_message = "All tt-api egress leaves through Cloud NAT (static IP on the Atlas access list)."
  }
  assert {
    condition     = alltrue([for s in [module.api.settings, module.web.settings, module.cms.settings] : s.ingress == "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER" && s.default_uri_disabled])
    error_message = "Every Cloud Run service is LB-only with no default URL."
  }
  assert {
    condition     = module.web.settings.min_instances >= 1 && module.cms.settings.min_instances == 0
    error_message = "tt-web keeps one instance; tt-cms scales to zero."
  }
}

run "edge_websockets_and_armor" {
  command = apply

  assert {
    condition     = module.edge.settings.relay_timeout_sec >= 3600
    error_message = "WebSockets must live at least an hour on the ALB."
  }
  assert {
    condition     = module.edge.settings.relay_timeout_sec == 86400
    error_message = "Relay backend timeout is 86400 s (the ALB maximum WebSocket life)."
  }
  assert {
    condition     = module.edge.settings.relay_protocol == "HTTP"
    error_message = "Relay backend protocol is HTTP (HTTP/1.1 upgrade), never HTTP2."
  }
  assert {
    condition     = module.edge.settings.relay_session_affinity == "NONE"
    error_message = "One relay VM owns every party: no session affinity."
  }
  assert {
    condition     = module.edge.settings.relay_draining_sec <= 30
    error_message = "No long connection draining on the relay: a VM recreate must fit the 120 s restore window."
  }
  assert {
    condition     = module.edge.settings.scheme == "EXTERNAL_MANAGED"
    error_message = "Regional external Application Load Balancer (EXTERNAL_MANAGED)."
  }
  assert {
    condition     = length(module.edge.settings.backends_with_armor) == module.edge.settings.backend_count && module.edge.settings.backend_count == 7
    error_message = "Cloud Armor is attached to every backend (api, web, cms, their canaries and the relay)."
  }
  assert {
    condition     = module.edge.settings.relay_route_service && toset(module.edge.settings.relay_route) == toset(["/pawlegends/ws", "/pawlegends/ws/"])
    error_message = "The first api route sends /pawlegends/ws (exact) and /pawlegends/ws/ (prefix) to the relay."
  }
  assert {
    condition = alltrue([
      for r in module.edge.settings.armor_rules : r.action == "deny(403)" && join(",", r.ranges) == "*" if r.priority == 2147483647
    ]) && length([for r in module.edge.settings.armor_rules : r if r.priority == 2147483647]) == 1
    error_message = "The Cloud Armor default rule denies everything with 403."
  }
  assert {
    condition     = alltrue([for r in module.edge.settings.armor_rules : length(r.ranges) <= 10])
    error_message = "At most 10 source ranges per Cloud Armor rule."
  }
  assert {
    condition = length(distinct(flatten([
      for r in module.edge.settings.armor_rules : r.ranges if r.action == "allow"
    ]))) == length(var.cloudflare_ipv4) + length(var.cloudflare_ipv6)
    error_message = "Every Cloudflare range (v4 and v6) is admitted, none twice."
  }
  assert {
    condition     = length([for r in module.edge.settings.armor_rules : r if r.action == "throttle" && strcontains(coalesce(r.expr, ""), "/pawlegends/ws")]) >= 1
    error_message = "A per-IP throttle protects /pawlegends/ws."
  }
  assert {
    condition     = contains(module.edge.settings.relay_paths, "/pawlegends/ws") && contains(module.edge.settings.relay_paths, "/pawlegends/ws/*")
    error_message = "Both /pawlegends/ws and /pawlegends/ws/* go to the relay."
  }
}

run "secrets_have_no_values_and_least_privilege" {
  command = apply

  assert {
    condition     = join(",", module.secrets.accessors["SHELTER_DONATE_PRIVATE_KEY"]) == output.service_accounts["sa-api"]
    error_message = "The hot-wallet key is readable by sa-api only."
  }
  assert {
    condition = alltrue([
      for k in var.hot_wallet_secret_keys : join(",", module.secrets.accessors[k]) == output.service_accounts["sa-api"]
    ])
    error_message = "Every hot-wallet secret is readable by sa-api only."
  }
  assert {
    condition = alltrue([
      for k, readers in module.secrets.accessors : contains(var.relay_secret_keys, k) if contains(readers, output.service_accounts["sa-relay"])
    ])
    error_message = "sa-relay reads only the relay's secrets."
  }
  assert {
    condition = alltrue([
      for k, readers in module.secrets.accessors : !contains(readers, output.service_accounts["sa-web"]) && !contains(readers, output.service_accounts["sa-cms"]) && !contains(readers, output.service_accounts["sa-deploy"]) && !contains(readers, output.service_accounts["sa-tf-plan"])
    ])
    error_message = "Web, CMS and CI service accounts read no secret."
  }
  assert {
    condition     = length(module.secrets.names) == length(distinct(concat(var.do_secret_keys, var.extra_secret_keys)))
    error_message = "One secret container per env key (21 DigitalOcean keys plus the missing ones)."
  }
  assert {
    condition = alltrue(flatten([
      for id, roles in module.service_accounts.project_roles : [
        for r in roles : !contains(["roles/owner", "roles/editor", "roles/secretmanager.secretAccessor", "roles/iam.serviceAccountTokenCreator"], r)
      ]
    ]))
    error_message = "No workload or CI account gets owner, editor, project-wide secret access or token creation."
  }
  assert {
    condition     = toset(module.service_accounts.project_roles["sa-relay"]) == toset(["roles/logging.logWriter", "roles/monitoring.metricWriter"])
    error_message = "sa-relay only writes logs and metrics at project level."
  }
  assert {
    condition     = strcontains(google_project_iam_member.deploy_iap_ssh.condition[0].expression, "destination.port == 22") && strcontains(google_project_iam_member.deploy_os_login.condition[0].expression, "tt-relay")
    error_message = "sa-deploy's IAP and OS Login rights are limited to SSH on the relay VMs."
  }
  assert {
    condition     = !contains(module.service_accounts.project_roles["sa-deploy"], "roles/run.developer") && !contains(module.service_accounts.project_roles["sa-deploy"], "roles/run.admin")
    error_message = "sa-deploy has no project-wide Cloud Run write role (it could create a job running as sa-api)."
  }
  assert {
    condition     = toset([for k, m in google_cloud_run_v2_service_iam_member.deploy : m.name]) == toset(["tt-api", "tt-web", "tt-cms"]) && google_cloud_run_v2_job_iam_member.deploy_migrate.name == "tt-migrate"
    error_message = "sa-deploy deploys only tt-api, tt-web, tt-cms and tt-migrate."
  }
  assert {
    condition     = !contains(google_project_iam_custom_role.relay_deployer.permissions, "compute.instances.setMetadata")
    error_message = "The relay deployer never writes instance metadata (deploy.sh switches the image on the VM)."
  }
  assert {
    condition     = google_billing_account_iam_member.tf_plan_budget.role == "roles/billing.viewer"
    error_message = "sa-tf-plan can read the budget (plan refreshes it on the billing account)."
  }
  assert {
    condition     = output.service_accounts["sa-api"] == "sa-api@gleaming-medium-480114-g5.iam.gserviceaccount.com"
    error_message = "Service account emails are derived from the project id."
  }
  assert {
    condition     = length(google_service_account.tf_apply) == 0
    error_message = "No CI apply account unless ci_apply_enabled."
  }
}

run "wif_pinned_to_repo_and_main" {
  command = apply

  assert {
    condition     = strcontains(module.wif.attribute_condition, "assertion.repository=='zbagdzevicius/tokentails'")
    error_message = "WIF is pinned to the repository."
  }
  assert {
    condition     = strcontains(module.wif.attribute_condition, "assertion.ref=='refs/heads/main'")
    error_message = "WIF is pinned to main."
  }
  assert {
    condition     = strcontains(module.wif.attribute_condition, "assertion.repository_id=='835381356'")
    error_message = "WIF is pinned to the numeric repository id."
  }
  assert {
    condition     = endswith(module.wif.deploy_member, "/attribute.workflow_ref/zbagdzevicius/tokentails/.github/workflows/deploy-gcp.yml@refs/heads/main")
    error_message = "Only deploy-gcp.yml on main may impersonate sa-deploy."
  }
}

run "relay_firewall_is_narrow" {
  command = apply

  assert {
    condition     = toset(module.network.relay_firewall.health_checks.source_ranges) == toset(["35.191.0.0/16", "130.211.0.0/22"])
    error_message = "Health-check rule admits Google health checkers only."
  }
  assert {
    condition     = join(",", module.network.relay_firewall.health_checks.ports) == "8080" && join(",", module.network.relay_firewall.health_checks.target_tags) == "tt-relay"
    error_message = "Health checks reach port 8080 on the relay tag only."
  }
  assert {
    condition     = join(",", module.network.relay_firewall.from_lb.source_ranges) == "10.129.0.0/23" && join(",", module.network.relay_firewall.from_lb.ports) == "8080" && join(",", module.network.relay_firewall.from_lb.target_tags) == "tt-relay"
    error_message = "Player traffic reaches the relay from the proxy-only subnet on 8080 only."
  }
  assert {
    condition     = join(",", module.network.relay_firewall.iap_ssh.ports) == "22" && join(",", module.network.relay_firewall.iap_ssh.source_ranges) == "35.235.240.0/20"
    error_message = "SSH only from IAP."
  }
}

run "regions_as_configured" {
  command = apply

  assert {
    condition     = module.api.settings.location == "europe-west3" && module.web.settings.location == "europe-west3" && module.cms.settings.location == "europe-west3"
    error_message = "Cloud Run services in europe-west3."
  }
  assert {
    condition     = module.relay_vm.settings.region == "europe-west3" && module.edge.settings.region == "europe-west3"
    error_message = "Relay and load balancer in europe-west3."
  }
  assert {
    condition     = alltrue([for z in module.relay_vm.settings.zones : startswith(z, "europe-west3-")])
    error_message = "Relay zones inside the region."
  }
}

run "other_region_follows_the_variable" {
  command = apply

  variables {
    region = "europe-west4"
    zones  = ["europe-west4-a", "europe-west4-b"]
  }

  assert {
    condition     = module.api.settings.location == "europe-west4" && module.relay_vm.settings.region == "europe-west4" && module.edge.settings.region == "europe-west4"
    error_message = "Every regional resource follows var.region."
  }
}

run "media_bucket_is_never_public" {
  command = apply

  variables {
    static_bucket_enabled = true
  }

  assert {
    condition     = output.static_bucket.public_access_prevention == "enforced" && output.static_bucket.uniform_bucket_level_access
    error_message = "The media bucket enforces public access prevention and uniform access."
  }
  assert {
    condition     = alltrue([for m in output.static_bucket.members : !contains(["allUsers", "allAuthenticatedUsers"], m)])
    error_message = "No public member on the media bucket."
  }
}

run "budget_alerts_only" {
  command = apply

  assert {
    condition     = toset(module.budget.thresholds) == toset(["0.5:CURRENT_SPEND", "0.9:CURRENT_SPEND", "1:CURRENT_SPEND", "1:FORECASTED_SPEND"])
    error_message = "Budget alerts at 50/90/100 % actual and 100 % forecast."
  }
}

run "edge_has_no_staging_shortcuts" {
  command = apply

  assert {
    condition     = module.edge.settings.certificate_mode == "managed" && !module.edge.settings.http_listener
    error_message = "Production uses the Google-managed certificate and HTTPS only (the self-signed cert and :80 are staging-only)."
  }
  assert {
    condition     = length(module.edge.settings.extra_allowed_ranges) == 0
    error_message = "Production Cloud Armor admits Cloudflare only: no operator ranges."
  }
  assert {
    condition     = length(module.edge.dns_authorization_records) == length(module.edge.settings.hosts)
    error_message = "Every production host has a DNS authorization."
  }
}
