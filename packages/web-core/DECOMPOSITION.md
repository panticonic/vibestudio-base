# Web source transport authority

The web contract describes semantic source access. `session` selects cookie use; optional `network: {kind: "loopback", origin}` requests one local origin. These are independent choices. Public destinations remain the default.

`pages.ts` forwards the request to the canonical Chromium service client. It does not grant authority, infer ownership from a nonce, classify IP addresses or contact a second HTTP stack. The Host prepares and approves the exact local origin and binds the actual Host-owned native Chromium provider. Native egress resolves and pins allowed destinations on that provider's machine for the original navigation, redirects and subresources. A remote terminal's observed localhost address does not establish physical co-location.

The page memo key includes cookie session and explicit network origin, so a local or authenticated cached page cannot satisfy a request under another transport authority. Existing evidence digests and bounded UTF-8 reads remain actual observed data. Natural-language research functions decide what sources support the user's question; the transport does not prescribe a search route or an expected hostname.
