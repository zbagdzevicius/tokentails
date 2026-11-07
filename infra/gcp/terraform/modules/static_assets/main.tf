# Private media bucket (later replacement for new DigitalOcean Spaces uploads, behind cdn.<domain>). Never public:
# public access prevention is enforced and only the listed service accounts get object rights. Old Spaces URLs stay.
variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "bucket_name" {
  type = string
}

variable "writers" {
  description = "Service account emails that create objects (the API)."
  type        = list(string)
  default     = []
}

variable "readers" {
  description = "Service account emails that read objects (a CDN origin service account later)."
  type        = list(string)
  default     = []
}

variable "labels" {
  type    = map(string)
  default = {}
}

# Waiver: Google-managed encryption. CMEK adds a KMS key ring, rotation and an outage mode for no gain at this
# scale; nothing in this bucket is a secret value (uploaded cat and game media, written by sa-api only).
#trivy:ignore:GCP-0066
resource "google_storage_bucket" "media" {
  #checkov:skip=CKV_GCP_62:Off by default and private (public access prevention, sa-api writes only); Admin Activity audit logs record IAM and bucket changes, a second log bucket adds cost for no reader.
  project                     = var.project_id
  name                        = var.bucket_name
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = var.labels

  versioning {
    enabled = true
  }

  soft_delete_policy {
    retention_duration_seconds = 604800
  }
}

resource "google_storage_bucket_iam_member" "writer" {
  for_each = toset(var.writers)
  bucket   = google_storage_bucket.media.name
  role     = "roles/storage.objectCreator"
  member   = "serviceAccount:${each.value}"
}

resource "google_storage_bucket_iam_member" "reader" {
  for_each = toset(var.readers)
  bucket   = google_storage_bucket.media.name
  role     = "roles/storage.objectViewer"
  member   = "serviceAccount:${each.value}"
}

output "settings" {
  value = {
    name                        = google_storage_bucket.media.name
    location                    = google_storage_bucket.media.location
    public_access_prevention    = google_storage_bucket.media.public_access_prevention
    uniform_bucket_level_access = google_storage_bucket.media.uniform_bucket_level_access
    members = sort(concat(
      [for m in google_storage_bucket_iam_member.writer : m.member],
      [for m in google_storage_bucket_iam_member.reader : m.member],
    ))
  }
}
