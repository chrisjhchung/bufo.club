# Cloudflare Access is the whole admin auth story: it authenticates at the edge,
# and the Worker independently verifies the JWT it stamps on each request (see
# apps/api/src/middleware/access.ts), so reaching the Worker by its workers.dev
# hostname does not bypass this.
resource "cloudflare_zero_trust_access_policy" "admins" {
  account_id = var.account_id
  name       = "bufo-club admins${local.suffix}"
  decision   = "allow"

  include = [for email in var.admin_emails : { email = { email = email } }]
}

resource "cloudflare_zero_trust_access_application" "admin" {
  account_id       = var.account_id
  name             = "bufo.club admin${local.suffix}"
  type             = "self_hosted"
  session_duration = "24h"

  destinations = [
    { type = "public", uri = "${local.site_hostname}/admin" },
    { type = "public", uri = "${local.site_hostname}/api/admin" },
  ]

  policies = [{
    id         = cloudflare_zero_trust_access_policy.admins.id
    precedence = 1
  }]
}
