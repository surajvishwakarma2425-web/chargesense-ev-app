# ChargeSense: EV Help + Range Rescue

A complete, ready-to-run web project for the topic **EV vehicles: user-facing problems**.
Problem Statement 2: Sustainable Mobility and Transportation Management (supporting: 8 and 1).

## Special feature: Range Rescue (citizen charger rental)
Example: your EV has **10 km** of range left, but the nearest public charger is **20 km** away.
1. Enter your range in **Range Rescue**. The app keeps a 10% safety buffer.
2. If the nearest public charger is out of reach, it lists **citizen chargers** you can reach, with plug type, power and price per kWh.
3. Log in and press **Request**. Choose how many kWh you need.
4. The charger owner sees the request in **Requests** and decides:
   - **Approve**: the exact address and phone number are shared with the driver only now.
   - **Decline**: nothing is shared.
5. After charging, the owner enters the kWh delivered and presses **Finish and charge fee**. The fee is `kWh x owner's price` and is shown to both people.

Owners control everything: they log in, list a charger, set the price, hide or show it, and approve each request. Before approval, drivers only see an approximate location.

## Run it (2 steps)
Requirements: **Node.js 18 or newer** (https://nodejs.org). No `npm install` needed.

1. Open a terminal in this folder.
2. Run `node server.js` (or `npm start`; on Windows double-click `start.bat`).

Open **http://localhost:3000**.

## Demo accounts (password: `demo1234`)
- `driver@demo.com`: request chargers
- `owner@demo.com` and `priya@demo.com`: own citizen chargers, approve requests

Try it: log in as driver, keep range at 10 km, press **Check my options**, request "Home wall box". Open a second browser window (or private window), log in as owner, approve it, then finish the session.

## Features
- Range Rescue with a reach map (no internet map needed)
- Citizen charger sharing with owner approval, pricing and fees
- User accounts (passwords stored hashed with scrypt, 7-day sessions)
- Public charger finder with plug, speed and availability filters
- Busy-hours heatmap and chart of common EV user problems
- Trip range planner, charging cost calculator, quick fixes
- Techy light and dark design, works on phones

## Project structure
```
server.js          Node.js server and JSON API (no dependencies)
public/index.html  Page
public/style.css   Design
public/insights.js Heatmap, chart, finder filters, calculators
public/app.js      Range Rescue, login, owner and request screens
data/db.json       Created on first run (users, chargers, requests)
tests/test.js      Automated test of the full rental flow (npm test)
```

## API summary
`POST /api/register`, `POST /api/login`, `POST /api/logout`, `GET /api/me`, `GET /api/stations`, `GET /api/chargers`, `GET|POST /api/chargers/mine`, `PATCH|DELETE /api/chargers/:id`, `GET|POST /api/requests`, `POST /api/requests/:id/respond|complete|cancel`

## Notes and limits (mention these in your report)
- **Payments are simulated.** The app records the fee; driver and owner settle directly (UPI or cash). A real product would add a payment gateway.
- Public stations and survey numbers are **sample data**. Distances are straight-line distance x 1.3, an estimate of road distance.
- Data is stored in `data/db.json`. Delete this file to reset to the demo data.
- For real deployment use HTTPS, a real database, email verification, ratings and ID checks for owners, and insurance terms.

## Future scope
Live charger API, real map, payment gateway, ratings and reviews, owner schedules, mobile app.
