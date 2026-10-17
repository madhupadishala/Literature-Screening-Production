import { inventoryControlledLabelDocuments } from "../lib/listedness-intelligence/label-document-inventory-service";

const inventory = await inventoryControlledLabelDocuments();

console.log(JSON.stringify(inventory, null, 2));

if (inventory.repositories === 0) {
  console.error("No active controlled knowledge repository is available.");
  process.exit(2);
}

if (inventory.labelCandidates.length === 0) {
  console.error("No product-specific labeling documents were detected in the active controlled knowledge repository.");
  process.exit(3);
}
