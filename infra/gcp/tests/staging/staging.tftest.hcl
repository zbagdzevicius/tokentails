# terraform test for envs/staging (the throwaway stack) with mocked google providers: no credentials, no cloud calls.
#   cd infra/gcp/terraform/envs/staging && terraform init -backend=false && terraform test
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
  project_id     = "tokentails-staging"
  operator_cidrs = ["203.0.113.7/32"]
  backend_tag    = "0000000"
  web_tag        = "0000000"
  cms_tag        = "0000000"
}

run "staging_targets_only_tokentails_staging" {
  command = plan

  variables {
    project_id = "gleaming-medium-480114-g5"
  }

  expect_failures = [var.project_id]
}

run "staging_refuses_motored" {
  command = plan

  variables {
    project_id = "motored-497708"
  }

  expect_failures = [var.project_id]
}

run "staging_refuses_an_open_armor_rule" {
  command = plan

  variables {
    operator_cidrs = ["0.0.0.0/0"]
  }

  expect_failures = [var.operator_cidrs]
}

run "staging_refuses_real_hostnames" {
  command = plan

  variables {
    domain = "tokentails.com"
  }

  expect_failures = [var.domain]
}

run "staging_stack" {
  command = apply

  # Reachable without DNS or Cloudflare, and still default-deny.
  assert {
    condition     = output.settings.edge.certificate_mode == "self_managed" && output.settings.edge.http_listener
    error_message = "Staging serves a self-signed certificate and plain HTTP (no DNS to validate a managed one)."
  }
  assert {
    condition     = toset(output.settings.edge.extra_allowed_ranges) == toset(["203.0.113.7/32"])
    error_message = "Cloud Armor admits the operator's /32 only, besides Cloudflare."
  }
  assert {
    condition     = one([for r in output.settings.edge.armor_rules : r.action if r.priority == 2147483647]) == "deny(403)"
    error_message = "The default Cloud Armor rule stays deny(403) on staging."
  }
  assert {
    condition     = toset(one([for r in output.settings.edge.armor_rules : r.ranges if r.priority == 900])) == toset(["203.0.113.7/32"])
    error_message = "The operator rule carries exactly the operator ranges."
  }
  assert {
    condition     = alltrue([for h in output.settings.edge.hosts : endswith(h, ".staging.tokentails.test") || h == "staging.tokentails.test"])
    error_message = "Staging uses fake .test hostnames only."
  }
  assert {
    condition     = length(module.edge.dns_authorization_records) == 0
    error_message = "No DNS authorizations on staging (nothing to add at Cloudflare)."
  }

  # Same service shape as production: LB-only ingress, no default URL.
  assert {
    condition = alltrue([for s in [output.settings.api, output.settings.web, output.settings.cms] :
    s.ingress == "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER" && s.default_uri_disabled])
    error_message = "Staging services are reached only through the load balancer, like production."
  }
  assert {
    condition     = output.settings.api.env.BACKEND_ROLE == "api" && output.settings.api.env.NODE_ENV == "production"
    error_message = "tt-api runs the api role in production mode."
  }
  assert {
    condition     = output.settings.relay.plain_env.BACKEND_ROLE == "relay" && output.settings.relay.external_ip == false
    error_message = "The relay runs the relay role with no external IP."
  }

  # Throwaway: everything can be destroyed.
  assert {
    condition     = module.api.settings.service_account == "sa-api@tokentails-staging.iam.gserviceaccount.com"
    error_message = "Every resource lands in tokentails-staging."
  }
  assert {
    condition     = google_compute_instance.mongo.deletion_protection == false
    error_message = "The mongo VM must be deletable."
  }
  assert {
    condition     = length(flatten([for n in google_compute_instance.mongo.network_interface : n.access_config])) == 0
    error_message = "The mongo VM has no external IP."
  }
  assert {
    condition     = google_compute_firewall.mongo_from_subnet.source_ranges == toset(["10.10.0.0/20"])
    error_message = "MongoDB is reachable from the main subnet only."
  }
  assert {
    condition     = output.mongo_uri == "mongodb://10.10.0.50:27017/tokentails"
    error_message = "MONGODB_URI points at the in-VPC throwaway mongo, never Atlas."
  }

  # Secrets: hot-wallet keys sa-api only; the relay reads only its keys.
  assert {
    condition     = toset(output.secret_accessors["INVALIDATE_CACHE_SECRET"]) == toset(["sa-api@tokentails-staging.iam.gserviceaccount.com"])
    error_message = "Hot-wallet secrets are readable by sa-api only."
  }
  assert {
    condition     = jsonencode(output.settings.relay.secrets) == jsonencode({ FRONT_END_URLS = "1", MONGODB_URI = "1", PAWLEGENDS_PARTY_TICKET_SECRET = "1" })
    error_message = "The relay mounts only its three secrets, pinned."
  }
}
