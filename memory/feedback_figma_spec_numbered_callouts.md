---
name: figma-spec-numbered-callouts
description: "When adding descriptions to the Figma spec doc, always add numbered callout badges on the screenshot image too"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: cdacbe02-2b5f-41d0-b61a-68093107f400
---

When adding new description items to the Figma 기획서 (spec document), if the screen section has a screenshot image, also inject numbered callout badges onto that screenshot image to match the description item numbers.

**Why:** User wants the screenshot and description numbers to stay in sync — each badge on the image visually points to the UI element being described.

**How to apply:** After creating a new desc item (with badge number N):
1. Use Playwright to re-open the HTML page and inject an absolutely-positioned badge div at the relevant UI element's position
2. Re-screenshot and upload to Figma to replace the existing image fill on the screen's Rectangle node
