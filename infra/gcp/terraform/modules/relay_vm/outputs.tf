output "instance_group" {
  description = "Regional MIG instance group (backend of the relay backend service)."
  value       = google_compute_region_instance_group_manager.relay.instance_group
}

output "mig_name" {
  value = google_compute_region_instance_group_manager.relay.name
}

output "lb_health_check_id" {
  value = google_compute_region_health_check.lb.id
}

output "cloud_init" {
  description = "Rendered cloud-init user-data (no secret values; checked by scripts/preflight.sh)."
  value       = local.cloud_init
}

output "settings" {
  description = "Key settings (for tests and review)."
  value = {
    region              = google_compute_region_instance_group_manager.relay.region
    zones               = google_compute_region_instance_group_manager.relay.distribution_policy_zones
    machine_type        = var.machine_type
    target_size         = google_compute_region_instance_group_manager.relay.target_size
    on_host_maintenance = google_compute_instance_template.relay.scheduling[0].on_host_maintenance
    external_ip         = length(flatten([for n in google_compute_instance_template.relay.network_interface : n.access_config])) > 0
    shielded            = google_compute_instance_template.relay.shielded_instance_config[0].enable_secure_boot
    autoheal_delay      = var.autoheal_initial_delay_seconds
    max_surge_fixed     = google_compute_region_instance_group_manager.relay.update_policy[0].max_surge_fixed
    plain_env           = local.plain_env
    secrets             = var.secrets
    tags                = google_compute_instance_template.relay.tags
  }
}
