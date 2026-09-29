# Approved bufos, the generator's template plates and the public manifest.
# Served straight from the CDN so reads never touch the Worker.
resource "cloudflare_r2_bucket" "assets" {
  account_id = var.account_id
  name       = local.assets_bucket
  location   = var.r2_location
}

# Submissions awaiting review. Never publicly readable; the admin API proxies it.
resource "cloudflare_r2_bucket" "pending" {
  account_id = var.account_id
  name       = local.pending_bucket
  location   = var.r2_location
}

resource "cloudflare_r2_custom_domain" "assets" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.assets.name
  domain      = local.cdn_hostname
  zone_id     = var.zone_id
  enabled     = true
  min_tls     = "1.2"
}

# Downloads and "copy image" go through fetch() rather than a bare <a download>,
# because a cross-origin anchor navigates instead of saving - so reads need CORS.
#
# Any origin is allowed deliberately. Every object in this bucket is already
# world-readable over the public custom domain, so `*` grants scripts nothing
# they could not already fetch by URL; restricting it only breaks the site's
# other hostnames (workers.dev, dev servers on an arbitrary port, previews)
# with an error that looks like an outage.
resource "cloudflare_r2_bucket_cors" "assets" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.assets.name

  rules = [{
    id = "public-read"
    allowed = {
      methods = ["GET", "HEAD"]
      origins = ["*"]
      headers = ["*"]
    }
    max_age_seconds = 3600
  }]
}
