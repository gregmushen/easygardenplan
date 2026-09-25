# Easy Garden Plan — High-Level Plan

Date: September 24, 2026

Product domain: easygardenplan.com

Planning documents location: ~/work/code/freegardenplan.com/docs/planning/

## Product direction

Easy Garden Plan should have two core outputs: a garden you can lay out and a schedule you can follow. Pro keeps that schedule current as the weather changes.

The promise: **“Plan your garden in minutes. Know what to plant, where, and when.”**

Build Easy Garden Plan as a separate application generated from Trestle. The framework reference for this plan is the local `main` branch at commit `51bf4d6` in `/Users/gregmushen/work/code/gstack`, rather than the currently checked-out branch.

## 1. Start with a focused audience

Launch across all US regions, including Alaska and Hawaii, for home vegetable gardeners with raised beds or in-ground gardens. Support arbitrary valid polygon bed shapes. Build a broad, source-backed vegetable and herb library using Exa research; do not impose the previously suggested 20-crop launch cap. Geographic scope remains US-wide rather than global.

## 2. Build one complete planning experience

| Step | User experience | Result |
|---|---|---|
| Locate | Enter an address | Garden location, climate context, estimated frost dates |
| Map | Draw polygon beds over aerial imagery; enter or correct dimensions | A garden footprint with measurements for staking it out |
| Assess | Confirm sunlight, growing method, and basic soil conditions | Growing conditions for each bed |
| Choose | Select crops and how much they want to grow | A wish list checked against space and conditions |
| Plan | Review and adjust the proposed layout | Plant positions, spacing, and quantities |
| Follow | Open the calendar or “This week” view | Instructions for sowing, transplanting, care, and harvesting |

Keep the property map and bed layout connected: the map locates the garden; the bed layout provides the measurements and planting detail. Users should confirm measurements before staking.

Growing zone alone does not determine planting dates. The schedule should also account for local frost dates, the crop and variety, and eventually weather.

## 3. Make Free useful and Pro responsive

| Free | Pro |
|---|---|
| Saved garden layout | Everything in Free |
| Seasonal planting calendar | Forecast-adjusted planting recommendations |
| General weather-monitoring instructions | Frost alerts with crop-specific actions |
| Plant protection guidance | Updated tasks when planting is delayed |
| Mark crops as planted and tasks complete | Recommendations based on actual planting dates and progress |

Start Pro with email alerts and an in-app activity feed. Each recommendation should explain what changed, what to do, and why. Changes to the plan should remain visible rather than silently moving dates.

Example recommendations:

- “Hold off on transplanting your tomatoes—cold nights are forecast this week.”
- “Frost is possible Thursday night. Cover the lettuce in Bed 1 and bring your basil pots inside.”
- “You delayed planting last week. Here’s your updated schedule.”

Upgrade positioning: **“Your plan follows the seasons. Pro follows the weather.”**

## 4. Make the planning rules trustworthy

The central product asset is a structured crop library: spacing, sowing methods, planting windows, temperature needs, frost sensitivity, and approximate maturity. Use Exa to discover authoritative sources and extract candidate records. Preserve field-level citations, regional applicability, units, and review status; reconcile conflicting guidance before publishing rules. Exa is selected, using existing user credits. Proceed on the user-authorized assumption that the crop-library workflow is permitted while the user requests confirmation from Exa. Account connection remains to be completed; provider confirmation is pending, not a planning blocker.

Use explicit rules to turn that information into plans and schedules. Track the source and assumptions behind recommendations. AI can help explain a recommendation, but the dates and spacing should come from inspectable rules.

Store the planned date separately from the actual planted date. That distinction supports almost every useful Pro feature.

## 5. Use Trestle for the application foundation

Trestle’s main branch documents the foundations we need:

- **Astro:** public site and acquisition pages.
- **React:** garden editor, onboarding, calendar, and dashboard.
- **Hono + PostgreSQL:** gardens, beds, plantings, schedules, and weather observations.
- **Authentication and tenancy:** private household gardens, with a simple consumer-facing account experience.
- **Billing and email adapters:** Pro access and notifications.

Keep gardening rules in the application’s domain layer, with separate adapters for maps, climate data, forecasts, and solar data.

Trestle’s roadmap still identifies production and background-processing verification work, so proving scheduled weather checks and reliable alert delivery should be an early milestone.

## 6. Build in this order

| Phase | Deliverable | Completion criterion |
|---|---|---|
| Feasibility | Validate location, frost, forecast, map, and solar inputs | We understand coverage, accuracy, licensing, and cost |
| Free planner | Address → beds → crops → layout and calendar | A gardener can use it to stake and plant a real garden |
| Pro monitoring | Weather checks, revised recommendations, frost emails | Relevant alerts arrive reliably without duplicates |
| Pilot | A small group using their own gardens | We learn whether plans are practical and alerts change useful actions |

Manual sunlight entry is the initial approach. The feasibility assessment excludes Google Solar under its current published use restrictions. Geoapify is the selected geocoder; aerial imagery is required for launch, with MapLibre GL JS as the renderer and MapTiler Cloud selected for map tiles and aerial imagery. See [02-feasibility.md](02-feasibility.md) for evidence and the accepted scope decisions.

## First milestone

One complete example: **a real address, two garden beds, a handful of crops, a usable planting calendar, and a simulated frost event that produces the right Pro recommendation.**

That exercises the whole product before investing heavily in a sophisticated editor.
