# What your AI will and won't say

Hand this to a client during onboarding, and again the first time they ask
"but what if it says something stupid to my customer?" That question kills
deals when it's answered vaguely and closes them when it's answered exactly.

Everything below is enforced in the assistant prompt (`lib/vapi-config.ts`),
not aspiration. If a live call ever contradicts this page, that's a bug —
send the recording.

---

## The first thing every caller hears

> "Thanks for calling — you've reached [your company]'s automated assistant,
> and this call may be recorded. What's going on?"

It identifies itself as automated on the first sentence, every single call.
It never pretends to be a person, never gives itself a human name, and never
claims to work in your office.

Two reasons, and the second one matters more:

1. Recording disclosure keeps you clean in a two-party-consent state.
2. A caller who figures out mid-call that they were fooled stops trusting
   your company, not just the robot. Disclosed up front, almost nobody cares.

---

## What it will do

**Find out if it's an emergency, first.** Active flooding, a burst pipe,
water spreading right now — that's the first question, before names or
numbers, because it changes everything that follows.

**Get you a callable lead.** Name, callback number, service address. It also
records the number they actually dialed from, so a number garbled over the
sound of running water doesn't cost you the job.

**Ask the intake questions you'd ask.** Standing water, water category, when
the loss happened, insurance carrier. One question at a time, waiting for
each answer — it never reads a list at somebody.

**Hand a live emergency to you, on the phone, immediately.** It tells the
caller it's connecting them, then calls your cell and waits for you to
actually speak before bridging. It never tries to solve a crisis alone.

**Take a message from anyone who isn't a customer.** Wrong numbers,
suppliers, someone who knows you personally — the moment it's clear this
isn't a service call, it stops the intake questions, takes a message, reads
it back, and lets them go. Nobody gets interrogated about standing water for
calling the wrong number.

**Check in when someone goes quiet** instead of sitting in dead silence.

**Email you the moment the call ends**, with the callback number in the
subject line so you can see it without opening anything.

---

## What it won't do

**It won't quote a price.** Not a range, not a "usually around", not
"depends". Pricing is yours.

**It won't diagnose.** It won't tell someone their subfloor is fine, that
mold isn't a concern, or what their insurance will cover.

**It won't promise a specific technician or a specific time slot** beyond
the arrival window you approved. It never asks a caller to pick a date off a
calendar — no customer standing in water wants a date picker.

**It won't turn anyone away.** Out of your service area, ambiguous problem,
caller who can't explain what's wrong — it takes the details and tells them
your office will call back to confirm. A wrongly refused emergency costs far
more than a wasted callback.

**It won't argue.** Upset caller gets a brief acknowledgment and the call
keeps moving forward.

**It won't handle payments, cancellations, or account changes.** Not built
for it, and won't pretend.

**It won't replace your team.** It only ever picks up the calls nobody
answered — after hours, during a storm surge, when every line is full. When
your office answers, the AI never hears the call at all.

---

## When it's unsure

It treats the call as an emergency.

That's deliberate and it's the single most important line in the whole
prompt. It will occasionally transfer you something that turns out to be
routine. It will not talk itself out of taking a real emergency seriously.
One unnecessary transfer costs you thirty seconds; one missed emergency
costs a five-figure job and a review.

---

## When something breaks

If the assistant itself can't be reached — a network fault on our side or
the voice provider's — the call does not just die. A backup voicemail
answers, apologizes, takes their name and number, and emails it straight to
us. The caller never hears an error, a status code, or a beep into nowhere.

If a live emergency transfer rings out and you don't pick up, the assistant
comes back on the line, tells the caller you already have their address and
number and will call right back, finishes the intake, and hangs up politely.
You get an email flagged **MISSED EMERGENCY TRANSFER** so it's obvious in a
crowded inbox.

---

## Changing any of this

Anything on this page can be adjusted for your company — different intake
questions, a different arrival window, "always ask if it's a rental",
"never book anything in Wayne County". Reply to any lead email and say what
you want changed. It takes minutes and applies to the next call.
