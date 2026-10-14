# Brief — clinic-booking

## Pitch

A booking product for small physiotherapy clinics: patients book and manage
appointments online, clinic staff manage their calendar, and each clinic gets a
public page that converts visitors into bookings. We sell it to clinics as SaaS.

## Answers

- **Problem:** small clinics take bookings by phone; staff lose hours a day to it and no-shows are high because there are no reminders.
- **Users:** patients (book, reschedule, cancel); clinic receptionists (manage the calendar, block time); clinic owners (set services, prices, staff hours). Patients come first when needs conflict.
- **Today's alternative:** phone and a paper or Google calendar; a few use expensive enterprise practice-management suites.
- **Core flows:**
  1. Patient books an appointment from the clinic's public page — acceptance: picks a service, a free slot, enters details, gets a confirmation email.
  2. Patient reschedules or cancels via a link — acceptance: the slot frees immediately and staff see the change.
  3. Receptionist manages the day calendar — acceptance: sees the day, blocks time, moves an appointment.
  4. Owner sets services, prices, and staff hours — acceptance: changes appear in the booking flow.
  5. Reminder sent 24 hours before — acceptance: patient receives an email with reschedule link.
  6. Owner sees no-show and utilisation stats — acceptance: weekly numbers per practitioner.
- **First release:** flows 1–5. Stats wait.
- **Riskiest assumptions:** patients will book online instead of calling; reminders reduce no-shows.
- **Non-goals:** no clinical notes or medical records, no payments in v1, no native mobile apps, no insurance integration.
- **Success:** 10 paying clinics in 6 months; 60% of their bookings online; no-shows down 30%.
- **Surfaces:** a web app for staff (desktop, daily, all-day use); a patient booking flow (mobile-first); a public marketing page per clinic.
- **Brand and feel:** no brand yet. Feel: calm, trustworthy, clear. Not: clinical-cold. References they like: Cal.com, Linear. No own photography.
- **Interaction frequency:** receptionists use it hundreds of times a day; patients a few times a year.
- **Constraints:** team of 4 (2 full-stack TypeScript, 1 Python, 1 designer); EU patients, so GDPR applies and personal health-adjacent data must stay in the EU; budget for managed services but no dedicated ops person; 4 months to v1.
- **Scale:** 10 clinics at launch, aiming for 500 within two years; each clinic ~50 bookings/day; peak on Monday mornings.
- **Tenancy:** multi-tenant — one clinic must never see another's patients.
- **Data:** relational with real invariants (no double-booking a slot).
- **Size:** product.

## Approvals

Approve every phase.
