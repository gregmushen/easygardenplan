import type { AuthEnvironment } from "@easygardenplan/auth";
import { NotificationRepository } from "@easygardenplan/data";
import type { Database } from "@easygardenplan/db";
import { applicationEventCatalog, recommendationTransitionedEvent, type EventDefinition } from "@easygardenplan/events";
import { createEmailService, gardenRecommendationTemplate } from "@easygardenplan/integrations";
import type { EventHandlerContext } from "./async-runtime.js";

type RecommendationTransitioned = { gardenId: string; episodeId: string; recommendationVersionId: string; transitionId: string; kind: "warning" | "material_change" | "resolution" | "renewed_warning"; riskRevision: number };

export const recommendationTransitionedConsumer: EventDefinition<RecommendationTransitioned> = {
  name: recommendationTransitionedEvent.name,
  schemaVersion: recommendationTransitionedEvent.schemaVersion,
  parse(payload: unknown) { return applicationEventCatalog.parse(recommendationTransitionedEvent.name, recommendationTransitionedEvent.schemaVersion, payload) as RecommendationTransitioned; },
};

export async function handleRecommendationTransitioned(payload: RecommendationTransitioned, _envelope: unknown, environment: AuthEnvironment, context: EventHandlerContext<Database>): Promise<void> {
  if (!context.data || !context.organizationId) throw new Error("Notification delivery requires tenant authority");
  const repository = new NotificationRepository(context.data, context.organizationId, context.clock);
  const claimed = await repository.claim(payload.transitionId);
  if (!claimed) return;
  const email = createEmailService({
    mode: environment.EMAIL_DELIVERY_MODE === "provider" || environment.EMAIL_DELIVERY_MODE === "resend" ? "resend" : "local",
    environment: environment.APP_ENV ?? "local",
    ...(environment.RESEND_API_KEY ? { resendApiKey: environment.RESEND_API_KEY } : {}),
    ...(environment.EMAIL_FROM ? { from: environment.EMAIL_FROM } : {}),
    ...(environment.EMAIL_REPLY_TO ? { replyTo: environment.EMAIL_REPLY_TO } : {}),
    ...(environment.EMAIL_STAGING_REDIRECT ? { stagingRedirect: environment.EMAIL_STAGING_REDIRECT } : {}),
  });
  try {
    const receipt = await email.send({
      to: claimed.recipient,
      subject: claimed.kind === "resolution" ? `Weather risk cleared for ${claimed.gardenName}` : `Weather update for ${claimed.gardenName}`,
      template: gardenRecommendationTemplate({ gardenName: claimed.gardenName, kind: claimed.kind, action: claimed.action ?? "Review the latest recommendation in your garden plan.", validFrom: claimed.validFrom, validThrough: claimed.validThrough }),
    }, { idempotencyKey: claimed.idempotencyKey, correlationId: context.event.correlationId, causationId: context.event.id, organizationId: context.organizationId });
    if (!await repository.accepted(claimed.intentId, claimed.attemptToken, receipt.id, receipt.acceptedAt)) throw new Error("Notification delivery lease was lost");
  } catch (error) {
    await repository.retry(claimed.intentId, claimed.attemptToken);
    throw error;
  }
}
