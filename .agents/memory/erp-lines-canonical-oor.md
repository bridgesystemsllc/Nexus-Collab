---
name: ERP lines in canonical OOR
description: Ownership and identity rules when production-order lines and imported open-order reports meet.
---

`OorLine` is the canonical operational report record. Link each ERP production line to it using the organization, production module item, and ERP line number; do not create a parallel operational dataset.

ERP refreshes own line identity, quantities, ERP dates, and open/closed lifecycle. A manual OOR status and all user-authored collaboration history must survive refreshes and report imports.

Imports may attach to an existing ERP-linked row only when PO plus item/SKU identifies exactly one production line. Repeated or otherwise ambiguous matches must remain unchanged and surface an import-review warning.

**Why:** Production tracking and imported reports began as independent stores. Copying or fuzzy matching them would duplicate work, overwrite human decisions, and silently associate repeated SKU lines with the wrong production order.

**How to apply:** Any future ERP, import, drawer-edit, export, or scoped-report change must preserve the stable line link and field ownership above. Closed lines leave default open views but remain queryable as history.