output "lb_ip" {
  description = "Load balancer address. No DNS: use curl --resolve HOST:443:IP -k (or :80 over plain HTTP)."
  value       = module.edge.lb_ip
}

output "hosts" {
  value = { api = local.api_hosts, web = local.web_hosts, cms = local.cms_hosts }
}

output "smoke" {
  description = "Copy-paste checks against the staging stack (self-signed certificate: -k)."
  value = {
    api_http   = "curl -s -H 'Host: ${local.api_hosts[0]}' http://${module.edge.lb_ip}/healthz"
    api_https  = "curl -sk --resolve ${local.api_hosts[0]}:443:${module.edge.lb_ip} https://${local.api_hosts[0]}/healthz"
    relay      = "curl -sk --resolve ${local.api_hosts[0]}:443:${module.edge.lb_ip} https://${local.api_hosts[0]}/pawlegends/ws -o /dev/null -w '%%{http_code}\\n'"
    web_https  = "curl -sk --resolve ${local.web_hosts[0]}:443:${module.edge.lb_ip} https://${local.web_hosts[0]}/ -o /dev/null -w '%%{http_code}\\n'"
    cms_https  = "curl -sk --resolve ${local.cms_hosts[0]}:443:${module.edge.lb_ip} https://${local.cms_hosts[0]}/ -o /dev/null -w '%%{http_code}\\n'"
    ws_latency = "node infra/gcp/tools/ws-latency.mjs https://${local.api_hosts[0]} --connect ${module.edge.lb_ip} --insecure --origin https://${local.web_hosts[0]}"
  }
}

output "nat_ip" {
  value = module.network.nat_ip
}

output "artifact_registry" {
  value = module.artifact_registry.repository_url
}

output "mongo_uri" {
  description = "Throwaway in-VPC MongoDB (no auth, subnet only). scripts/staging-secrets.sh stores it as MONGODB_URI version 1."
  value       = local.mongo_uri
}

output "front_end_urls" {
  description = "FRONT_END_URLS value for staging (the relay checks the Origin header against it)."
  value       = join(",", [for h in local.web_hosts : "https://${h}"])
}

output "service_accounts" {
  value = local.sa
}

output "relay_mig" {
  value = module.relay_vm.mig_name
}

output "secret_names" {
  value = module.secrets.names
}

output "secret_accessors" {
  value = module.secrets.accessors
}

output "settings" {
  description = "Key settings (for tests and review)."
  value = {
    edge  = module.edge.settings
    api   = module.api.settings
    web   = module.web.settings
    cms   = module.cms.settings
    relay = module.relay_vm.settings
  }
}
