{ pkgs }: {
  deps = [
    pkgs.nodejs_20
    pkgs.nodePackages.pnpm
    pkgs.postgresql_16
    pkgs.redis
    pkgs.openssl
  ];
}
