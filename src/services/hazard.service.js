import { randomBytes } from "node:crypto";
import { getSessionUser } from "./auth.service.js";
import { getDatabase } from "../config/database.server.js";
import { json, readObject, sameOrigin } from "../utils/http.js";
import { clean } from "../utils/validation.js";
import { hazardTypes, frequencies, } from "../config/hazard-options.js";
function makeRecommendations(brief) {
    const isVehicleRisk = /forklift|line-of-fire/i.test(brief.hazard);
    const isPpeRisk = /ppe/i.test(brief.hazard);
    const isZoneRisk = /restricted|confined/i.test(brief.hazard);
    const primaryTitle = isVehicleRisk
        ? "Vehicle safety and line-of-fire monitoring"
        : isPpeRisk
            ? "PPE compliance monitoring"
            : isZoneRisk
                ? "Restricted-zone safety monitoring"
                : `${brief.hazard} monitoring`;
    const primaryTrigger = isVehicleRisk
        ? "A pedestrian enters a vehicle path or a moving vehicle breaches the configured separation distance."
        : isPpeRisk
            ? "Required PPE is missing, incorrectly worn, or a worker enters a PPE-controlled area."
            : isZoneRisk
                ? "A person enters a controlled area without the required authorization or safety controls."
                : "A configured unsafe condition is detected within the monitored area.";
    const primaryCoverage = isVehicleRisk
        ? `Analyse existing CCTV at ${brief.area}; verify coverage of shared aisles, reversing routes and blind spots.`
        : `Review camera coverage at ${brief.area} and position views around the highest-risk work area.`;
    const primaryAction = isVehicleRisk
        ? "Pause affected vehicle movement, clear the pedestrian route and confirm separation before work resumes."
        : "Notify the responsible supervisor, verify the control and record the corrective action before work resumes.";
    const focus = brief.conditions.length > 126 ? `${brief.conditions.slice(0, 123)}…` : brief.conditions;
    return [
        {
            priority: "Priority 1",
            severity: "Critical",
            title: primaryTitle,
            description: `${focus} This monitoring layer prioritizes the most immediate exposure at ${brief.area}.`,
            coverage: primaryCoverage,
            alertRoute: "Smart speaker or PA alert; mobile push notification to EHS and the area supervisor.",
            trigger: primaryTrigger,
            nextStep: brief.controls
                ? `${primaryAction} Review the existing controls: ${brief.controls}`
                : primaryAction,
        },
        {
            priority: "Priority 2",
            severity: "High",
            title: `Risk-zone monitoring at ${brief.area}`,
            description: "Create a defined AI safety zone around the reported exposure so changing site conditions are surfaced early.",
            coverage: "Monitor the risk boundary and all approach paths; retain event clips for EHS review.",
            alertRoute: "EHS dashboard event with supervisor escalation for repeated or unacknowledged alerts.",
            trigger: "A worker, vehicle or equipment enters the defined risk zone while the hazard condition is active.",
            nextStep: "Review controls, remove any obstruction and confirm the zone is safe before normal operations continue.",
        },
        {
            priority: "Priority 3",
            severity: "High",
            title: `${brief.frequency} exposure verification`,
            description: `Repeated exposure affects ${brief.exposed}. Track patterns by shift, task and time of day to target controls where they are needed.`,
            coverage: "Observe repeat movements and compliance patterns across the reported operating period.",
            alertRoute: "Daily exception summary for EHS, operations and the site safety lead.",
            trigger: "The same unsafe pattern repeats or thresholds are exceeded during the configured period.",
            nextStep: "Schedule a control review, adjust the workflow and confirm that corrective actions are effective.",
        },
    ];
}
function publicPlan(plan, full) {
    return {
        id: plan._id,
        brief: plan.brief,
        recommendations: full ? plan.recommendations : plan.recommendations.slice(0, 1),
        lockedCount: full ? 0 : Math.max(0, plan.recommendations.length - 1),
    };
}
export async function handleHazardRequest(request) {
    const path = new URL(request.url).pathname;
    const match = path.match(/^\/api\/hazard\/plans\/([a-zA-Z0-9_-]{32})(\/unlock)?$/);
    const create = path === "/api/hazard/plans";
    const unlock = Boolean(match?.[2]);
    if (!create && !match)
        return json({ error: "Not found." }, 404);
    const method = create || unlock ? "POST" : "GET";
    if (request.method !== method)
        return json({ error: "Method not allowed." }, 405, { Allow: method });
    if (method === "POST" && !sameOrigin(request))
        return json({ error: "Invalid request origin." }, 403);
    try {
        const user = await getSessionUser(request);
        if (unlock && !user)
            return json({ error: "Log in to unlock your report." }, 401);
        if (create) {
            const input = await readObject(request);
            if (!input)
                return json({ error: "Invalid hazard brief." }, 400);
            const brief = {
                area: clean(input["area"]),
                hazard: clean(input["hazard"]),
                conditions: clean(input["conditions"]),
                exposed: clean(input["exposed"]),
                frequency: clean(input["frequency"]),
                controls: clean(input["controls"]),
            };
            if (!brief.area ||
                brief.area.length > 120 ||
                !hazardTypes.includes(brief.hazard) ||
                !brief.conditions ||
                brief.conditions.length > 4000 ||
                !brief.exposed ||
                brief.exposed.length > 240 ||
                !frequencies.includes(brief.frequency) ||
                brief.controls.length > 2000)
                return json({ error: "Complete the required hazard fields within the indicated limits." }, 400);
            const plan = {
                _id: randomBytes(24).toString("base64url"),
                brief,
                recommendations: makeRecommendations(brief),
                ownerId: user?.id ?? null,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 30 * 86400 * 1000),
            };
            await (await getDatabase()).collection("hazardPlans").insertOne(plan);
            return json({ ok: true, plan: publicPlan(plan, Boolean(user)) }, 201);
        }
        const plans = (await getDatabase()).collection("hazardPlans");
        const filter = { _id: match[1], expiresAt: { $gt: new Date() } };
        if (unlock && user) {
            const plan = await plans.findOneAndUpdate({ ...filter, $or: [{ ownerId: null }, { ownerId: user.id }] }, { $set: { ownerId: user.id } }, { returnDocument: "after" });
            return plan
                ? json({ ok: true, plan: publicPlan(plan, true) })
                : json({ error: "Report not found or unavailable." }, 404);
        }
        const plan = await plans.findOne(filter);
        if (!plan || (plan.ownerId && plan.ownerId !== user?.id))
            return json({ error: "Report not found or unavailable." }, 404);
        return json({ ok: true, plan: publicPlan(plan, Boolean(plan.ownerId && user)) });
    }
    catch (error) {
        console.error("Hazard report error:", error);
        return json({ error: "The report service is unavailable. Please try again shortly." }, 503);
    }
}
