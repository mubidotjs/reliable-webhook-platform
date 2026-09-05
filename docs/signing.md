# Webhook signature verification

M1 defines the signature contract and secret format. Webhook delivery begins in M2.

Endpoint creation and rotation return a secret once in this form:

```text
whsec_<unpadded-base64url-encoded-32-byte-key>
```

Store the displayed value securely. Remove the `whsec_` prefix and decode the remaining base64url text to recover the 32-byte HMAC key.

For each future delivery, join the event ID, Unix timestamp, and exact raw request body:

```text
eventId.timestamp.rawBody
```

Compute HMAC-SHA256 with the decoded key, encode the digest as unpadded base64url, and compare the complete `v1=<digest>` value in constant time. Do not parse and reserialize JSON before verification.

Deterministic vector:

```text
secret bytes (hex): 000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
event ID: evt_01HZX3K8M8
timestamp: 1725000000
raw body: {"type":"invoice.paid"}
signature: v1=omZcTTBuJJnULdTyA-qozSZy5vVKVPYyakdi4c4TZ4g
```
