ui = false
disable_mlock = true

storage "raft" {
  path    = "/openbao/data"
  node_id = "openbao-a"
}

listener "tcp" {
  address            = "0.0.0.0:8200"
  cluster_address    = "0.0.0.0:8201"
  tls_cert_file      = "/openbao/tls/server.crt"
  tls_key_file       = "/openbao/tls/server.key"
  tls_client_ca_file = "/openbao/tls/ca.crt"
}

audit "file" "yujian-owner" {
  description = "Yujian Owner approval and KMS audit"
  options {
    file_path    = "/openbao/data/audit.log"
    mode         = "0600"
    log_raw      = "false"
    hmac_accessor = "true"
  }
}

api_addr     = "https://openbao-a:8200"
cluster_addr = "https://openbao-a:8201"
