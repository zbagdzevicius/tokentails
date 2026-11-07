output "lb_ip" {
  description = "Point the Cloudflare A records (proxied) here."
  value       = google_compute_address.lb.address
}

output "dns_authorization_records" {
  description = "CNAMEs to add at Cloudflare (DNS only, grey cloud) so Certificate Manager can issue the certificate."
  value = {
    for k, a in google_certificate_manager_dns_authorization.host : a.domain => try({
      name = a.dns_resource_record[0].name
      type = a.dns_resource_record[0].type
      data = a.dns_resource_record[0].data
    }, null)
  }
}

output "security_policy" {
  value = google_compute_region_security_policy.edge.name
}

output "backend_services" {
  value = merge(
    { for k, b in google_compute_region_backend_service.run : k => b.name },
    { relay = google_compute_region_backend_service.relay.name }
  )
}

output "settings" {
  description = "Key settings (for tests and review)."
  value = {
    region                 = google_compute_address.lb.region
    scheme                 = google_compute_forwarding_rule.https.load_balancing_scheme
    relay_timeout_sec      = google_compute_region_backend_service.relay.timeout_sec
    relay_protocol         = google_compute_region_backend_service.relay.protocol
    relay_session_affinity = google_compute_region_backend_service.relay.session_affinity
    relay_draining_sec     = google_compute_region_backend_service.relay.connection_draining_timeout_sec
    relay_paths            = var.relay_paths
    hosts                  = local.all_hosts
    armor_rules = [for r in google_compute_region_security_policy.edge.rules : {
      priority = r.priority
      action   = r.action
      ranges   = try(r.match[0].config[0].src_ip_ranges, [])
      expr     = try(r.match[0].expr[0].expression, null)
    }]
    backends_with_armor = [for b in concat(values(google_compute_region_backend_service.run), [google_compute_region_backend_service.relay]) : b.name if b.security_policy != null]
  }
}
