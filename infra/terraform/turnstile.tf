# Gate on anonymous uploads and reports. Managed mode is invisible to most
# people and free at any volume.
resource "cloudflare_turnstile_widget" "uploads" {
  account_id = var.account_id
  name       = "bufo-club uploads${local.suffix}"
  domains    = [local.site_hostname, "localhost"]
  mode       = "managed"
  region     = "world"
}
