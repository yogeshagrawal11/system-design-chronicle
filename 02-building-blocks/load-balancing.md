# Load Balancing

- **L4** (transport): routes by IP/port; fast, protocol-agnostic.
- **L7** (application): routes by URL, headers, cookies; enables TLS termination, path routing.

## Algorithms
Round robin · Weighted round robin · Least connections · IP hash · Consistent hashing

## Concerns
Health checks, sticky sessions (avoid if possible), LB redundancy (active-passive / DNS), connection draining.
