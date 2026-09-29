terraform {
  required_version = ">= 1.9"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # State lives in R2 via its S3-compatible API. Create the bucket once by hand
  # (see infra/README.md) and export AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
  # with an R2 token before running terraform init.
  backend "s3" {
    bucket = "bufo-tfstate"
    key    = "bufo-club.tfstate"
    region = "auto"

    endpoints = {
      s3 = "https://dfe124fd5805dab55f4c61db09683534.r2.cloudflarestorage.com"
    }

    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
