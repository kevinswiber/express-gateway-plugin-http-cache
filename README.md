# express-gateway-plugin-http-cache

This plugin for [Express Gateway](https://express-gateway.io) adds a local, persistent, HTTP-aware cache.

## Installation

Simply type from your shell environment:

```bash
eg plugin install express-gateway-plugin-http-cache
```

## Quick start

1. Make sure the plugin is listed in [system.config.yml file](https://www.express-gateway.io/docs/configuration/system.config.yml/).
This is done automatically for you if you used the command above.

2. Add the configuration keys to [gateway.config.yml file](https://www.express-gateway.io/docs/configuration/gateway.config.yml/).

```yaml
policies:
  - http-cache:
      - action:
          ttl: 60 # default TTL in the absence of HTTP caching semantics
          showIndicator: true # adds an Express-Gateway-Cache header indicating hit or miss
  - proxy:
      - action:
          serviceEndpoint: backend
```
## Want to make your own plugin?

Just check out our [plugin development guide](https://www.express-gateway.io/docs/plugins/).
We can't wait to see your custom stuff in the Gateway!
