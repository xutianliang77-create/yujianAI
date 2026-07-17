ui = false
disable_mlock = true

storage "raft" {
  path    = "/openbao/data"
  node_id = "openbao-c"
}

listener "tcp" {
  address            = "0.0.0.0:8200"
  cluster_address    = "0.0.0.0:8201"
  tls_cert_file      = "/openbao/tls/server.crt"
  tls_key_file       = "/openbao/tls/server.key"
  tls_client_ca_file = "/openbao/tls/ca.crt"
}

api_addr     = "https://openbao-c:8200"
cluster_addr = "https://openbao-c:8201"
