output "lb_ip" {
  description = "Cloudflare A records (proxied) for the shadow hosts first, then the real ones at cutover."
  value       = module.edge.lb_ip
}

output "nat_ip" {
  description = "Add to the MongoDB Atlas IP access list before the cutover."
  value       = module.network.nat_ip
}

output "dns_authorization_records" {
  description = "CNAMEs for Certificate Manager (Cloudflare, DNS only)."
  value       = module.edge.dns_authorization_records
}

output "artifact_registry" {
  value = module.artifact_registry.repository_url
}

output "workload_identity_provider" {
  description = "GitHub repo variable GCP_WIF_PROVIDER."
  value       = module.wif.provider_name
}

output "service_accounts" {
  description = "Runtime and CI service account emails (derived; the same values the account resources report)."
  value       = local.sa
}

output "relay_mig" {
  value = module.relay_vm.mig_name
}

output "secret_names" {
  description = "Containers to fill (RUNBOOK.md step 3). No values live in Terraform."
  value       = module.secrets.names
}

output "secret_accessors" {
  value = module.secrets.accessors
}

output "api_settings" {
  value = module.api.settings
}

output "web_settings" {
  value = module.web.settings
}

output "relay_settings" {
  value = module.relay_vm.settings
}

output "edge_settings" {
  value = module.edge.settings
}

output "relay_firewall" {
  value = module.network.relay_firewall
}

output "wif_condition" {
  value = module.wif.attribute_condition
}

output "service_account_roles" {
  value = module.service_accounts.project_roles
}

output "budget_thresholds" {
  value = module.budget.thresholds
}

output "relay_cloud_init" {
  description = "Rendered relay user-data (no secret values)."
  value       = module.relay_vm.cloud_init
}

output "deploy_ssh_conditions" {
  description = "Conditions that keep sa-deploy's IAP and OS Login rights on the relay only."
  value = {
    iap      = google_project_iam_member.deploy_iap_ssh.condition[0].expression
    os_login = google_project_iam_member.deploy_os_login.condition[0].expression
  }
}

output "static_bucket" {
  value = var.static_bucket_enabled ? module.static_assets[0].settings : null
}
