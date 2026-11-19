# Phone setup in Natlang

| Step | Form | Reason |
| --- | --- | --- |
| Choose whether to resume or start setup | `setUpPhone` | A paired phone needs its workspace checked before the user can unplug it. |
| Choose a desktop, prepare tools, and discover attached phones | `discoverPhone` with separate read, decision, and preparation leaves | An assigned desktop or the unique platform-compatible desktop can act. Ambiguity goes back to the card. |
| Select one ready attached device, or request one physical action | `choosePhone` | Discoveries may cover several devices, and discovery issues can describe the next physical action in prose. |
| Install and pair | `pairPhone` with a scoped service | The adapter validates the discovery receipt and calls the existing public phone service. |
| Observe the paired device's workspace and interpret the result | `checkWorkspace` with separate read and decision leaves | This step can run again against a saved paired device without preparing tools or creating another pairing. |

The existing setup card remains the interactive entry point in System. The
workflow adapter uses the same public workspace client, which holds transport,
stream decoding, and server authorization. It passes exact receipts between stages
and exposes no invitation or refresh material.
