---
version: alpha
name: School Pay
description: An offline school accounts workspace with a shared frosted glass design.
colors:
  publicLightCanvas: "#F3F4FF"
  publicDarkCanvas: "#0C1027"
  publicLightInk: "#171735"
  publicDarkInk: "#F4F3FF"
  publicLightAction: "#5536C6"
  publicDarkAction: "#BDA8FF"
typography:
  sans:
    fontFamily: "Inter, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
spacing:
  page-max: "74rem"
components:
  navigation: {}
  button: {}
  card: {}
  input: {}
---

# School Pay design system

The overview introduces school administrators and accountants to student accounts, fee collection and receipts. The receipt layered over a sample cash book is the signature visual. Label illustrative amounts as samples. Staff and parent sign-in use a centered form. The workspace uses the same atmosphere and glass surfaces with a floating rail, compact summary cards and more opaque backgrounds behind dense data.

`app/glass-tokens.css` owns the shared palette. `app/components/welcome/welcome.css` styles the public composition. `app/workspace.css` maps the palette to existing form, table, status, and navigation tokens. Use 16px blur, a translucent one-pixel border, and soft shadows. The mobile header compacts to 26px blur on scroll. The desktop rail groups links by task, and the mobile workspace menu is a native modal with keyboard focus return. Use the installed font stack. Receipt, challan, and salary slip print styles own paper geometry and colors.

Persist the site theme through the existing `school-theme` preference. Provide visible keyboard focus, labeled form controls, a collapsible mobile menu with Escape and focus return, and reduced motion. Reserve space for sign-in feedback and keep the submit button size stable while busy. Existing authentication and role destinations remain authoritative.

Dashboard charts use the same semantic palette as the ledger. Collections use violet, expenses use the expense tone, and annual charges use green. Use a common PKR axis for cash-flow comparisons. Give each period a selectable control and show exact amounts in text. Dense timelines scroll within the chart on small screens.

School signup uses the public sign-in shell and floating-label fields, with a single-column form on narrow screens. The shared sign-in form accepts a username and password or a parent phone number and PIN. Show a school choice only when the verified parent credentials match multiple schools. Use text for pending, approved, and rejected states in the Super Admin workspace. Show the school and its contact details with each decision and confirm the action in context.

The Generate Vouchers printout and Parent Portal preview share the official challan component and school-saved branding. Stack the preview copies on narrow screens. Print Bank Copy, Student Copy and Information side by side on A4 landscape.

Show a trial school’s expiry and remaining days in a persistent workspace notice. Use text and a warning accent for the 7-, 3- and 1-day reminders. In the client list, show the deadline and distinguish expired trials from manual suspension.
