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
    env_metadata_key     = "tt-relay-env"
    secrets_metadata_key = "tt-relay-secrets"
    stop_timeout_seconds = 60
    drain_max_seconds    = 1800
  })
}
