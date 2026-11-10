# MediSchedule – Doctor Availability & Appointment Management (Demo)

A beginner practice project: a hospital-style dashboard built with plain HTML, CSS and JavaScript. **All data is fictional**, nothing connects to a real hospital, and no server, database, API key or paid service is needed.

## Features
- Dashboard: doctors, today's appointments, available / booked / overused / unused slots, charts, notifications
- Doctors: add, edit, view, delete, change availability
- Patient Appointments: book, cancel, reschedule, search and filter, live slot grid
- Doctor Availability: see who is free on a date or at a specific time
- Appointment Analytics: capacity, remaining slots, fully booked / high-demand / underused doctors
- AI Recommendations: **demonstration** demand estimate and alternative-slot suggestions (a weighted average, not a trained AI model)
- Settings: thresholds, export JSON, delete appointments, reset demo data
- Data persists in the browser (LocalStorage)

## Run it
Open `index.html` in a browser. That's all.

## Project files
| File | Purpose |
|---|---|
| `index.html` | Page structure: sidebar, seven sections, form fields, empty containers |
| `style.css` | Colours, layout, responsive rules (sidebar becomes a menu on phones) |
| `script.js` | All behaviour: data, booking rules, charts, buttons |
| `README.md` | This guide |

## How HTML, CSS and JavaScript work together
HTML defines *what* is on the page, CSS defines *how it looks*, and JavaScript defines *what happens*. `script.js` reads the data, builds HTML text for tables and charts, and puts it into the containers in `index.html`. `style.css` styles those elements.

## How booking works
1. Choose a doctor and date. `freeSlots()` builds the doctor's slots from start time, end time and slot length, then removes booked ones.
2. On Save, `submitAppt()` runs a checklist in order: name, phone, doctor, date not in the past, doctor available, works that weekday, time inside working hours, slot not taken, daily capacity not reached.
3. The first failed check shows a red message. For slot problems, alternatives are shown (same doctor, then next 7 days, then same specialization).
4. If all pass, the appointment is saved to LocalStorage and the whole interface re-renders, so statistics update automatically.

## How duplicates are prevented
`taken(doctor, date, time)` looks for any non-cancelled appointment with the same doctor, date and time. If one exists, booking stops. Cancelling sets the status to "Cancelled", which frees the slot. When rescheduling, the appointment ignores itself in this check.

## How the demand estimate works
`forecast()` uses 8 weeks of fictional daily totals. For each upcoming day it takes the same weekday from all 8 weeks, gives newer weeks more weight (1 to 8), and multiplies by a growth factor (average of the last 4 weeks ÷ the first 4, limited to 0.85–1.15). Days well above the 7-day average are marked "Busier". This is a transparent demonstration calculation, not machine learning.

Definitions used: *Overused slots* = booked slots with doctors at or above the high-demand percentage today; *Unused slots* = open slots with doctors at or below the underused percentage (both adjustable in Settings).

## Upload to GitHub
1. Sign in at github.com and click **New repository**. Name it `hospital-appointment-system`, keep it **Public**, click **Create repository**.
2. Unzip the download. Click **uploading an existing file**, drag in `index.html`, `style.css`, `script.js` and `README.md` (the files, not the outer folder).
3. Click **Commit changes**.

## Publish with GitHub Pages
1. In the repository, open **Settings → Pages**.
2. Under **Build and deployment**, set Source to **Deploy from a branch**, choose branch `main` and folder `/ (root)`, then **Save**.
3. Wait 1–2 minutes and refresh. Your link will be `https://YOUR-USERNAME.github.io/hospital-appointment-system/`.

All paths are relative, so the site works from this address.
