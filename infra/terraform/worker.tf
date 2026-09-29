# The Worker script itself is deployed by wrangler; Terraform only owns the
# hostname it answers on. Run `pnpm deploy` once before the first apply so the
# service exists.
resource "cloudflare_workers_custom_domain" "site" {
  account_id = var.account_id
  zone_id    = var.zone_id
  hostname   = local.site_hostname
  service    = local.worker_service
}
