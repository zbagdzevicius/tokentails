# Renders the relay cloud-init with sample inputs, offline (no provider, no cloud), for scripts/preflight.sh:
#   terraform -chdir=infra/gcp/scripts/render-cloud-init init && terraform -chdir=... apply -auto-approve -state=<tmp>
terraform {
  required_version = ">= 1.9"
}

output "user_data" {
  value = templatefile("${path.module}/../../terraform/modules/relay_vm/templates/cloud-init.yaml.tftpl", {
    port                 = 8080
    registry_host        = "europe-west3-docker.pkg.dev"
    image_metadata_key   = "tt-relay-image"
    plain_env            = { NODE_ENV = "production", BACKEND_ROLE = "relay", PORT = "8080", NO_COLOR = "1" }
    secrets              = { MONGODB_URI = "1", PAWLEGENDS_PARTY_TICKET_SECRET = "1", FRONT_END_URLS = "1" }
    stop_timeout_seconds = 60
    drain_max_seconds    = 1800
  })
}
