# www.bufo.club redirects to the apex, so each bufo has exactly one canonical
# URL rather than two hostnames serving identical pages.
#
# The redirect is a Single Redirect rule, which lives in the dynamic-redirect
# phase and fires at the edge - ahead of the Worker, so www traffic never
# reaches it. The Worker custom domain below is still required: it provides the
# proxied DNS record for www, without which no request reaches Cloudflare for
# the rule to act on. A plain CNAME to the apex cannot serve that purpose,
# because the apex is itself a Worker custom domain with no origin behind it.
#
# Production only - a staging environment has no www.

resource "cloudflare_workers_custom_domain" "www" {
  count = local.is_production ? 1 : 0

  account_id = var.account_id
  zone_id    = var.zone_id
  hostname   = "www.${var.zone_name}"
  service    = local.worker_service
}

resource "cloudflare_ruleset" "www_redirect" {
  count = local.is_production ? 1 : 0

  zone_id = var.zone_id
  name    = "www to apex"
  kind    = "zone"
  phase   = "http_request_dynamic_redirect"

  rules = [{
    ref         = "www_to_apex"
    description = "Send www.bufo.club to bufo.club, keeping the path and query"
    enabled     = true
    expression  = "(http.host eq \"www.${var.zone_name}\")"
    action      = "redirect"

    action_parameters = {
      from_value = {
        status_code           = 301
        preserve_query_string = true
        target_url = {
          expression = "concat(\"https://${var.zone_name}\", http.request.uri.path)"
        }
      }
    }
  }]
}
