output "network_id" {
  value = google_compute_network.main.id
}

output "network_name" {
  value = google_compute_network.main.name
}

output "subnet_id" {
  value = google_compute_subnetwork.main.id
}

output "subnet_name" {
  value = google_compute_subnetwork.main.name
}

output "proxy_only_subnet_id" {
  value = google_compute_subnetwork.proxy_only.id
}

output "proxy_only_cidr" {
  value = google_compute_subnetwork.proxy_only.ip_cidr_range
}

output "nat_ip" {
  description = "Static egress IP: add it to the MongoDB Atlas IP access list."
  value       = google_compute_address.nat.address
}

output "nat_name" {
  value = google_compute_router_nat.main.name
}

output "router_name" {
  value = google_compute_router.main.name
}

output "relay_firewall" {
  description = "What the relay firewall rules allow (for tests and review)."
  value = {
    health_checks = {
      source_ranges = google_compute_firewall.relay_health_checks.source_ranges
      target_tags   = google_compute_firewall.relay_health_checks.target_tags
      ports         = flatten([for a in google_compute_firewall.relay_health_checks.allow : a.ports])
    }
    from_lb = {
      source_ranges = google_compute_firewall.relay_from_lb.source_ranges
      target_tags   = google_compute_firewall.relay_from_lb.target_tags
      ports         = flatten([for a in google_compute_firewall.relay_from_lb.allow : a.ports])
    }
    iap_ssh = {
      source_ranges = google_compute_firewall.relay_iap_ssh.source_ranges
      target_tags   = google_compute_firewall.relay_iap_ssh.target_tags
      ports         = flatten([for a in google_compute_firewall.relay_iap_ssh.allow : a.ports])
    }
  }
}
