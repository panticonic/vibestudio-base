---
description: Establish that the selected durable channel retained exactly one row for the claimed origin.
args:
  observation: DeliveryHistoryObservation
returns: DeliveryOrigin
---
If the receipt channel differs from the observed channel, return foreign-channel. Then return missing-message for no retained rows, or repeated-message for more than one retained row. For one row, call matchReceipt with the receipt and row and return its verdict. Identical words in a different channel can never establish origin.
