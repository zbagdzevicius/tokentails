locals {
  all_hosts = distinct(concat(var.api_hosts, var.web_hosts, var.cms_hosts))
  # Cloud Armor: at most 10 source ranges per basic rule.
  cf_ranges = concat(var.cloudflare_ipv4, var.cloudflare_ipv6)
  cf_chunks = chunklist(local.cf_ranges, 10)
  # Advanced expressions allow 5 subexpressions: the path test plus 4 ranges per throttle rule.
  ws_chunks     = chunklist(local.cf_ranges, 4)
  dns_auth_keys = { for h in local.all_hosts : replace(h, ".", "-") => h }
}

resource "terraform_data" "proxy_subnet" {
  input = var.proxy_only_subnet_id
}

resource "google_compute_address" "lb" {
  project      = var.project_id
  name         = "${var.name}-ip"
  region       = var.region
  address_type = "EXTERNAL"
  network_tier = "PREMIUM"
}

# ---------------------------------------------------------------------------------------------------------------------
# Certificate (Certificate Manager, regional, DNS authorization: a CNAME per host at Cloudflare, DNS only)

resource "google_certificate_manager_dns_authorization" "host" {
  for_each = local.dns_auth_keys
  project  = var.project_id
  name     = "${var.name}-${each.key}"
  location = var.region
  domain   = each.value
  type     = "PER_PROJECT_RECORD"
}

resource "google_certificate_manager_certificate" "edge" {
  project  = var.project_id
  name     = "${var.name}-cert"
  location = var.region

  managed {
    domains            = local.all_hosts
    dns_authorizations = [for k in keys(local.dns_auth_keys) : google_certificate_manager_dns_authorization.host[k].id]
  }
}

resource "google_compute_region_ssl_policy" "modern" {
  project         = var.project_id
  name            = "${var.name}-tls12"
  region          = var.region
  profile         = "MODERN"
  min_tls_version = "TLS_1_2"
}

# ---------------------------------------------------------------------------------------------------------------------
# Cloud Armor: Cloudflare only, per-player throttle on the relay path, default deny

resource "google_compute_region_security_policy" "edge" {
  project     = var.project_id
  name        = "${var.name}-cloudflare-only"
  region      = var.region
  type        = "CLOUD_ARMOR"
  description = "Admit Cloudflare edges only (cf-connecting-ip cannot be forged), throttle relay upgrades per player."

  dynamic "rules" {
    for_each = { for i, c in local.ws_chunks : i => c }
    content {
      priority    = 100 + rules.key
      action      = "throttle"
      description = "relay upgrades per cf-connecting-ip (Cloudflare ranges ${rules.key})"
      match {
        expr {
          expression = "request.path.startsWith('/pawlegends/ws') && (${join(" || ", [for r in rules.value : "inIpRange(origin.ip, '${r}')"])})"
        }
      }
      rate_limit_options {
        conform_action      = "allow"
        exceed_action       = "deny(429)"
        enforce_on_key      = "HTTP_HEADER"
        enforce_on_key_name = "cf-connecting-ip"
        rate_limit_threshold {
          count        = var.ws_rate_limit_per_minute
          interval_sec = 60
        }
      }
    }
  }

  dynamic "rules" {
    for_each = { for i, c in local.cf_chunks : i => c }
    content {
      priority    = 1000 + rules.key
      action      = "allow"
      description = "Cloudflare edge ranges ${rules.key}"
      match {
        versioned_expr = "SRC_IPS_V1"
        config {
          src_ip_ranges = rules.value
        }
      }
    }
  }

  rules {
    priority    = 2147483647
    action      = "deny(403)"
    description = "Default: anything not from Cloudflare"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }
}

# ---------------------------------------------------------------------------------------------------------------------
# Backends

resource "google_compute_region_network_endpoint_group" "run" {
  for_each              = { api = var.api_service, web = var.web_service, cms = var.cms_service }
  project               = var.project_id
  name                  = "${var.name}-${each.key}-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = each.value
  }
}

resource "google_compute_region_backend_service" "run" {
  provider              = google-beta
  for_each              = google_compute_region_network_endpoint_group.run
  project               = var.project_id
  name                  = "${var.name}-${each.key}"
  region                = var.region
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"
  security_policy       = google_compute_region_security_policy.edge.id

  backend {
    group           = each.value.id
    balancing_mode  = "UTILIZATION"
    capacity_scaler = 1
  }

  log_config {
    enable      = true
    sample_rate = var.log_sample_rate
  }
}

# The party relay: plain HTTP/1.1 to the VM (WebSocket upgrade), one VM so no affinity is needed, long sockets.
resource "google_compute_region_backend_service" "relay" {
  provider                        = google-beta
  project                         = var.project_id
  name                            = "${var.name}-relay"
  region                          = var.region
  load_balancing_scheme           = "EXTERNAL_MANAGED"
  protocol                        = "HTTP"
  port_name                       = var.relay_port_name
  timeout_sec                     = var.relay_timeout_sec
  connection_draining_timeout_sec = var.relay_draining_sec
  session_affinity                = "NONE"
  locality_lb_policy              = "ROUND_ROBIN"
  health_checks                   = [var.relay_health_check]
  security_policy                 = google_compute_region_security_policy.edge.id

  backend {
    group           = var.relay_instance_group
    balancing_mode  = "UTILIZATION"
    max_utilization = 1
    capacity_scaler = 1
  }

  log_config {
    enable      = true
    sample_rate = 1
  }
}

resource "google_compute_region_url_map" "edge" {
  project         = var.project_id
  name            = "${var.name}-map"
  region          = var.region
  default_service = google_compute_region_backend_service.run["web"].id

  host_rule {
    hosts        = var.api_hosts
    path_matcher = "api"
  }

  host_rule {
    hosts        = var.web_hosts
    path_matcher = "web"
  }

  host_rule {
    hosts        = var.cms_hosts
    path_matcher = "cms"
  }

  path_matcher {
    name            = "api"
    default_service = google_compute_region_backend_service.run["api"].id

    path_rule {
      paths   = var.relay_paths
      service = google_compute_region_backend_service.relay.id
    }
  }

  path_matcher {
    name            = "web"
    default_service = google_compute_region_backend_service.run["web"].id
  }

  path_matcher {
    name            = "cms"
    default_service = google_compute_region_backend_service.run["cms"].id
  }
}

resource "google_compute_region_target_https_proxy" "edge" {
  project                          = var.project_id
  name                             = "${var.name}-https"
  region                           = var.region
  url_map                          = google_compute_region_url_map.edge.id
  certificate_manager_certificates = [google_certificate_manager_certificate.edge.id]
  ssl_policy                       = google_compute_region_ssl_policy.modern.id
}

resource "google_compute_forwarding_rule" "https" {
  project               = var.project_id
  name                  = "${var.name}-https"
  region                = var.region
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  port_range            = "443"
  target                = google_compute_region_target_https_proxy.edge.id
  ip_address            = google_compute_address.lb.id
  network               = var.network
  network_tier          = "PREMIUM"

  depends_on = [terraform_data.proxy_subnet]
}
