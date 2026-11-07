locals {
  # Google front ends and health checkers (https://cloud.google.com/load-balancing/docs/health-check-concepts#ip-ranges).
  health_check_ranges = ["35.191.0.0/16", "130.211.0.0/22"]
  # IAP TCP forwarding, used by the relay deploy (gcloud compute ssh --tunnel-through-iap).
  iap_range = "35.235.240.0/20"
}

resource "google_compute_network" "main" {
  project                 = var.project_id
  name                    = var.name
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

resource "google_compute_subnetwork" "main" {
  project                  = var.project_id
  name                     = "${var.name}-${var.region}"
  region                   = var.region
  network                  = google_compute_network.main.id
  ip_cidr_range            = var.subnet_cidr
  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = var.flow_log_sampling
    metadata             = "EXCLUDE_ALL_METADATA"
  }
}

# Waiver: a REGIONAL_MANAGED_PROXY subnet holds only the load balancer's Envoy proxies and does not support Private
# Google Access (the main subnet has it on).
#trivy:ignore:GCP-0075
resource "google_compute_subnetwork" "proxy_only" {
  project       = var.project_id
  name          = "${var.name}-proxy-only-${var.region}"
  region        = var.region
  network       = google_compute_network.main.id
  ip_cidr_range = var.proxy_only_cidr
  purpose       = "REGIONAL_MANAGED_PROXY"
  role          = "ACTIVE"
}

resource "google_compute_router" "main" {
  project = var.project_id
  name    = "${var.name}-router-${var.region}"
  region  = var.region
  network = google_compute_network.main.id
}

# The one egress address: MongoDB Atlas allows only this IP after the cutover.
resource "google_compute_address" "nat" {
  project      = var.project_id
  name         = "${var.name}-nat-${var.region}"
  region       = var.region
  address_type = "EXTERNAL"
  network_tier = "PREMIUM"
}

resource "google_compute_router_nat" "main" {
  project                             = var.project_id
  name                                = "${var.name}-nat"
  region                              = var.region
  router                              = google_compute_router.main.name
  nat_ip_allocate_option              = "MANUAL_ONLY"
  nat_ips                             = [google_compute_address.nat.self_link]
  source_subnetwork_ip_ranges_to_nat  = "LIST_OF_SUBNETWORKS"
  min_ports_per_vm                    = var.nat_min_ports_per_vm
  enable_endpoint_independent_mapping = false

  subnetwork {
    name                    = google_compute_subnetwork.main.id
    source_ip_ranges_to_nat = ["ALL_IP_RANGES"]
  }

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# Health checks (autohealing and the load balancer) reach the relay on its port only.
resource "google_compute_firewall" "relay_health_checks" {
  project       = var.project_id
  name          = "${var.name}-allow-hc-relay"
  network       = google_compute_network.main.id
  direction     = "INGRESS"
  priority      = 1000
  source_ranges = local.health_check_ranges
  target_tags   = [var.relay_tag]

  allow {
    protocol = "tcp"
    ports    = [tostring(var.relay_port)]
  }

  log_config {
    metadata = "EXCLUDE_ALL_METADATA"
  }
}

# Player traffic: the load balancer's Envoy proxies connect from the proxy-only subnet.
resource "google_compute_firewall" "relay_from_lb" {
  project       = var.project_id
  name          = "${var.name}-allow-lb-relay"
  network       = google_compute_network.main.id
  direction     = "INGRESS"
  priority      = 1000
  source_ranges = [var.proxy_only_cidr]
  target_tags   = [var.relay_tag]

  allow {
    protocol = "tcp"
    ports    = [tostring(var.relay_port)]
  }

  log_config {
    metadata = "EXCLUDE_ALL_METADATA"
  }
}

# Deploys and break-glass: SSH only through IAP (no external IP on the VM).
resource "google_compute_firewall" "relay_iap_ssh" {
  project       = var.project_id
  name          = "${var.name}-allow-iap-ssh-relay"
  network       = google_compute_network.main.id
  direction     = "INGRESS"
  priority      = 1000
  source_ranges = [local.iap_range]
  target_tags   = [var.relay_tag]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  log_config {
    metadata = "EXCLUDE_ALL_METADATA"
  }
}
