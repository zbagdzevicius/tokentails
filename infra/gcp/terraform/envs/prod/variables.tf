# ---------------------------------------------------------------------------------------------------------------------
# Project guard: Token Tails projects only. The workstation's default gcloud project belongs to another company.

variable "project_id" {
  description = "Token Tails project: gleaming-medium-480114-g5 (production) or tokentails-staging (throwaway test). No default on purpose."
  type        = string

  validation {
    condition     = contains(["gleaming-medium-480114-g5", "tokentails-staging"], var.project_id) && !startswith(var.project_id, "motored")
    error_message = "project_id must be gleaming-medium-480114-g5 (production) or tokentails-staging. motored-* projects (another company) and any other project are refused."
  }
}

variable "billing_account" {
  description = "Billing account id (XXXXXX-XXXXXX-XXXXXX) of the founder's Token Tails account, for the budget."
  type        = string

  validation {
    condition     = can(regex("^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$", var.billing_account))
    error_message = "billing_account looks like 0X0X0X-0X0X0X-0X0X0X."
  }
}

variable "region" {
  description = "Frankfurt, the same metro as DigitalOcean fra and (target) Atlas."
  type        = string
  default     = "europe-west3"
}

variable "relay_region" {
  description = <<-EOT
    Region of the party relay VM (LATENCY-PLAN C1); null = var.region. The relay is served through the regional
    external ALB in var.region, which can only have backends in its own region, so today it must equal var.region.
    A relay elsewhere (a second region, `relay_regions`) needs a load balancer per region: LATENCY-NEXT.md G1-G5.
  EOT
  type        = string
  default     = null

  validation {
    condition     = var.relay_region == null || var.relay_region == var.region
    error_message = "relay_region must equal region while the relay sits behind the regional ALB (LATENCY-NEXT.md G1)."
  }
}

variable "relay_node_options" {
  description = "NODE_OPTIONS of the relay process (LATENCY-PLAN R3): a 64 MB young generation, fewer scavenges on the turn path."
  type        = string
  default     = "--max-semi-space-size=64"
}

variable "relay_uv_threadpool_size" {
  description = "UV_THREADPOOL_SIZE of the relay process (LATENCY-PLAN R3): TLS to Mongo, zlib and DNS off the default 4 threads."
  type        = number
  default     = 8
}

variable "budget_labels" {
  description = <<-EOT
    LATENCY-PLAN C3: count only costs carrying these labels in the budget (a single key and value, e.g.
    { app = "tokentails" }). Empty = the whole project, which also counts motored-dev, n8n-db and n8n. Unlabelled costs
    (network egress, Cloud NAT, logging) drop out of a label filter, so prefer raising budget_amount by those services'
    measured monthly baseline unless the founder chooses the filter.
  EOT
  type        = map(string)
  default     = {}

  validation {
    condition     = length(var.budget_labels) <= 1
    error_message = "Cloud Billing budgets filter on at most one label."
  }
}

variable "relay_rtt_eu_p95_ms" {
  description = "Alert when the relay's server-measured EU socket RTT p95 stays above this (LATENCY-PLAN C4)."
  type        = number
  default     = 80
}

variable "relay_turn_overrun_p99_ms" {
  description = "Alert when the relay's turn overrun p99 stays above this (LATENCY-PLAN C4)."
  type        = number
  default     = 5
}

variable "zones" {
  type    = list(string)
  default = ["europe-west3-a", "europe-west3-b", "europe-west3-c"]

  validation {
    condition     = length(var.zones) > 0
    error_message = "Give at least one zone."
  }
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "alert_email" {
  description = "Alerts and budget mails (the founder). Kept out of git: set it in terraform.tfvars."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))
    error_message = "alert_email must be an email address."
  }
}

# ---------------------------------------------------------------------------------------------------------------------
# Hostnames (they never change: NFT tokenURI, Stripe webhooks and installed apps use them)

variable "domain" {
  type    = string
  default = "tokentails.com"
}

variable "api_hosts" {
  description = "null: api.<domain> and the shadow gcp-api.<domain>."
  type        = list(string)
  default     = null
}

variable "web_hosts" {
  description = "null: <domain>, www.<domain> and the shadow gcp.<domain>."
  type        = list(string)
  default     = null
}

variable "cms_hosts" {
  description = "null: cats.<domain> and the shadow gcp-cats.<domain>."
  type        = list(string)
  default     = null
}

# ---------------------------------------------------------------------------------------------------------------------
# Images: CI builds and deploys them; these tags are only the first ones Terraform creates the services with.

variable "backend_tag" {
  description = "Backend image tag (git SHA) in Artifact Registry, used at creation only."
  type        = string
}

variable "web_tag" {
  type = string
}

variable "cms_tag" {
  type = string
}

# ---------------------------------------------------------------------------------------------------------------------
# Sizing

variable "relay_name" {
  description = "Base name of the relay MIG and its VMs (the deploy OS Login condition matches this prefix)."
  type        = string
  default     = "tt-relay"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,30}$", var.relay_name))
    error_message = "relay_name is a lower-case resource name."
  }
}

variable "relay_machine_type" {
  description = "t2d-standard-2 (2 cores, no SMT); t2d-standard-4 if mp/load.mjs calls for it."
  type        = string
  default     = "t2d-standard-2"
}

variable "max_live_rooms" {
  description = "The relay's live-room cap (PARTY_MAX_LIVE_ROOMS); alerts at 80 %. 100 = 70 % of the 150 rooms t2d-standard-2 held within budget in the staging load run (STAGING-PROOF.md). Re-measure after a machine change."
  type        = number
  default     = 100
}

variable "api" {
  type = object({
    cpu           = string
    memory        = string
    min_instances = number
    max_instances = number
    concurrency   = number
  })
  default = {
    cpu           = "1"
    memory        = "2Gi"
    min_instances = 1
    max_instances = 4
    concurrency   = 40
  }

  validation {
    condition     = var.api.min_instances >= 1
    error_message = "tt-api runs the leased crons in process: keep at least one instance."
  }
}

variable "web" {
  type = object({
    cpu           = string
    memory        = string
    min_instances = number
    max_instances = number
  })
  default = {
    cpu           = "1"
    memory        = "1Gi"
    min_instances = 1
    max_instances = 4
  }
}

variable "cms" {
  type = object({
    cpu           = string
    memory        = string
    min_instances = number
    max_instances = number
  })
  default = {
    cpu           = "1"
    memory        = "512Mi"
    min_instances = 0
    max_instances = 2
  }
}

# ---------------------------------------------------------------------------------------------------------------------
# Secrets: names only. Values are added by the founder (RUNBOOK.md step 3); every reference is pinned.

variable "do_secret_keys" {
  description = "The 21 keys set on the DigitalOcean app today, carried over 1:1 (doctl apps spec get, keys only)."
  type        = list(string)
  default = [
    "MONGODB_URI", "OPENAI_API_KEY", "ML_ACCESS_TOKEN", "FRONT_END_URLS", "DO_SPACES_ENDPOINT", "DO_SPACES_CDN",
    "DO_SPACES_KEY", "DO_SPACES_SECRET", "DO_SPACES_NAME", "MAIN_FE_DOMAIN", "INVALIDATE_CACHE_SECRET", "IS_PROD",
    "STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "GOOGLE_AI_API_KEY", "STRIPE_WEBHOOK_SECRET", "GTM_ID",
    "FB_PRIVATE_KEY", "SENDGRID_API_KEY", "PRINTIFY_API_KEY", "SHELTER_DONATE_PRIVATE_KEY",
  ]
}

variable "extra_secret_keys" {
  description = "Keys the code reads that DigitalOcean never set: empty containers, the founder decides one by one."
  type        = list(string)
  default = [
    "PAWLEGENDS_PARTY_TICKET_SECRET", "PAWLEGENDS_STRIPE_SECRET_KEY", "PAWLEGENDS_STRIPE_WEBHOOK_SECRET",
    "PAWLEGENDS_ENTITLEMENT_SECRET", "BADCAT_STRIPE_SECRET_KEY", "BADCAT_STRIPE_WEBHOOK_SECRET",
    "BADCAT_ENTITLEMENT_SECRET", "BADCAT_VAPID_PRIVATE_KEY", "CLUB_STRIPE_WEBHOOK_SECRET", "CLUB_TOKEN_SECRET",
    "RAVE_STRIPE_WEBHOOK_SECRET", "SHELTER_RELAY_IP_PEPPER", "SHELTER_TREAT_IP_SALT", "AI_UPLOAD_IP_SALT",
    "SHELTER_X402_FACILITATOR_AUTH", "SHELTER_TRY_PRIVATE_KEY", "APPLE_PRIVATE_KEY",
  ]
}

variable "api_secret_versions" {
  description = "Secrets mounted on tt-api => pinned version. null: every DigitalOcean key at version 1. Add an extra key here only after its value exists. The party ticket secret goes in party_ticket_secret_version instead."
  type        = map(string)
  default     = null

  validation {
    condition     = !contains(keys(coalesce(var.api_secret_versions, {})), "PAWLEGENDS_PARTY_TICKET_SECRET")
    error_message = "Pin PAWLEGENDS_PARTY_TICKET_SECRET with party_ticket_secret_version, so tt-api and the relay always use the same version."
  }
}

variable "party_ticket_secret_version" {
  description = "Pinned version of PAWLEGENDS_PARTY_TICKET_SECRET, mounted on tt-api (mints party tickets) and the relay (verifies them) at the same version. null until its value exists: tickets answer 503 and party rooms are unscored."
  type        = string
  default     = null

  validation {
    condition     = var.party_ticket_secret_version == null || can(regex("^[0-9]+$", coalesce(var.party_ticket_secret_version, "0")))
    error_message = "party_ticket_secret_version is a numeric version."
  }
}

variable "relay_secret_keys" {
  description = "The only secrets the relay VM may read (MONGODB_URI, the ticket secret and the origin list)."
  type        = list(string)
  default     = ["MONGODB_URI", "PAWLEGENDS_PARTY_TICKET_SECRET", "FRONT_END_URLS"]
}

variable "relay_secret_versions" {
  description = "Overrides of the relay's secret pins. null: the relay uses tt-api's pins for MONGODB_URI and FRONT_END_URLS, and party_ticket_secret_version for the ticket secret."
  type        = map(string)
  default     = null

  validation {
    condition     = !contains(keys(coalesce(var.relay_secret_versions, {})), "PAWLEGENDS_PARTY_TICKET_SECRET")
    error_message = "Pin PAWLEGENDS_PARTY_TICKET_SECRET with party_ticket_secret_version, so tt-api and the relay always use the same version."
  }
}

variable "hot_wallet_secret_keys" {
  description = "Keys that sign on-chain or decrypt custodial wallets: readable by sa-api only."
  type        = list(string)
  default     = ["SHELTER_DONATE_PRIVATE_KEY", "INVALIDATE_CACHE_SECRET", "SHELTER_TRY_PRIVATE_KEY"]
}

# ---------------------------------------------------------------------------------------------------------------------
# Edge

variable "cloudflare_ipv4" {
  description = "https://www.cloudflare.com/ips-v4 (same list as backend/src/shared/cloudflare-ips.ts, copied 2026-10-11). scripts/preflight.sh compares them."
  type        = list(string)
  default = [
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
    "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  ]

  validation {
    condition     = alltrue([for c in var.cloudflare_ipv4 : can(cidrhost(c, 0)) && !strcontains(c, ":")])
    error_message = "cloudflare_ipv4 holds IPv4 CIDRs."
  }
}

variable "cloudflare_ipv6" {
  description = "https://www.cloudflare.com/ips-v6"
  type        = list(string)
  default     = ["2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32"]

  validation {
    condition     = alltrue([for c in var.cloudflare_ipv6 : can(cidrhost(c, 0)) && strcontains(c, ":")])
    error_message = "cloudflare_ipv6 holds IPv6 CIDRs."
  }
}

variable "ws_rate_limit_per_minute" {
  type    = number
  default = 120
}

# ---------------------------------------------------------------------------------------------------------------------
# CI and budget

variable "github_repository" {
  description = "owner/name of the GitHub repository (git remote: github.com/zbagdzevicius/tokentails)."
  type        = string
  default     = "zbagdzevicius/tokentails"
}

variable "github_repository_id" {
  description = "Numeric id of that repository (gh api repos/OWNER/NAME --jq .id), pinned in the WIF condition."
  type        = string
  default     = "835381356"
}

variable "ci_apply_enabled" {
  description = "Create sa-tf-apply for the environment-gated apply job in terraform.yml. Off: the founder applies locally."
  type        = bool
  default     = false
}

variable "state_bucket" {
  description = "Terraform state bucket from ../../bootstrap (read by the CI plan job)."
  type        = string
  default     = null
}

variable "budget_amount" {
  type    = number
  default = 400
}

variable "budget_currency" {
  description = "Currency of the billing account."
  type        = string
  default     = "USD"
}

variable "static_bucket_enabled" {
  description = "Create the private media bucket for future uploads (cdn.<domain>, a later step). Spaces stays until then."
  type        = bool
  default     = false
}

variable "test_source_cidrs" {
  description = "LATENCY-PLAN E4 only: the operator's own address(es) Cloud Armor admits besides Cloudflare for the Cloudflare-vs-direct test (RUNBOOK \"Latency\"). Empty (the default) outside that test; set it in your own apply and set it back to [] afterwards."
  type        = list(string)
  default     = []

  validation {
    condition = length(var.test_source_cidrs) <= 2 && alltrue([
      for c in var.test_source_cidrs : can(cidrhost(c, 0)) && (strcontains(c, ":") ? tonumber(split("/", c)[1]) >= 64 : tonumber(split("/", c)[1]) == 32)
    ])
    error_message = "At most two single addresses: an IPv4 /32 or an IPv6 /64 or narrower. Never a range."
  }
}
