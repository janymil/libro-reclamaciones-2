import { and, count, eq, gte, sql } from "drizzle-orm";

import {
  aiFeedback,
  aiUsage,
  type AIFeedback,
  type AIUsage,
  type InsertAIFeedback,
  type InsertAIUsage,
} from "@shared/schema";

import { db } from "../db";
import type { AIFeedbackSummary, AIUsageSummary } from "./types";

/**
 * Data access for the AI cost meter and the draft feedback loop.
 *
 * Usage rows and feedback rows are append-only: nothing updates or deletes them.
 * That keeps the numbers auditable and makes a future monthly billing view a
 * plain aggregation.
 */
export const aiStorage = {
  async recordAIUsage(data: InsertAIUsage): Promise<AIUsage> {
    const [row] = await db.insert(aiUsage).values(data).returning();
    return row;
  },

  async getAIUsageSummary(businessId: string, since: Date): Promise<AIUsageSummary> {
    const condition = and(eq(aiUsage.businessId, businessId), gte(aiUsage.createdAt, since));

    const [totals] = await db
      .select({
        calls: count(),
        promptTokens: sql<number>`coalesce(sum(${aiUsage.promptTokens}), 0)::int`,
        completionTokens: sql<number>`coalesce(sum(${aiUsage.completionTokens}), 0)::int`,
        totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
        estimatedCostUsd: sql<string>`coalesce(sum(${aiUsage.estimatedCostUsd}), 0)`,
      })
      .from(aiUsage)
      .where(condition);

    const byFeature = await db
      .select({
        feature: aiUsage.feature,
        calls: count(),
        totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)::int`,
        estimatedCostUsd: sql<string>`coalesce(sum(${aiUsage.estimatedCostUsd}), 0)`,
      })
      .from(aiUsage)
      .where(condition)
      .groupBy(aiUsage.feature);

    return {
      calls: Number(totals?.calls ?? 0),
      promptTokens: Number(totals?.promptTokens ?? 0),
      completionTokens: Number(totals?.completionTokens ?? 0),
      totalTokens: Number(totals?.totalTokens ?? 0),
      estimatedCostUsd: Number(totals?.estimatedCostUsd ?? 0),
      byFeature: byFeature.map((row) => ({
        feature: row.feature,
        calls: Number(row.calls),
        totalTokens: Number(row.totalTokens),
        estimatedCostUsd: Number(row.estimatedCostUsd),
      })),
    };
  },

  async createAIFeedback(data: InsertAIFeedback): Promise<AIFeedback> {
    const [row] = await db.insert(aiFeedback).values(data).returning();
    return row;
  },

  async getAIFeedbackSummary(businessId: string, since: Date): Promise<AIFeedbackSummary> {
    const condition = and(eq(aiFeedback.businessId, businessId), gte(aiFeedback.createdAt, since));

    const [totals] = await db
      .select({
        total: count(),
        positive: sql<number>`count(*) filter (where ${aiFeedback.rating} > 0)::int`,
        negative: sql<number>`count(*) filter (where ${aiFeedback.rating} < 0)::int`,
      })
      .from(aiFeedback)
      .where(condition);

    const byFeature = await db
      .select({
        feature: aiFeedback.feature,
        total: count(),
        positive: sql<number>`count(*) filter (where ${aiFeedback.rating} > 0)::int`,
        negative: sql<number>`count(*) filter (where ${aiFeedback.rating} < 0)::int`,
      })
      .from(aiFeedback)
      .where(condition)
      .groupBy(aiFeedback.feature);

    const positive = Number(totals?.positive ?? 0);
    const negative = Number(totals?.negative ?? 0);

    return {
      total: Number(totals?.total ?? 0),
      positive,
      negative,
      acceptanceRate: positive + negative > 0 ? positive / (positive + negative) : null,
      byFeature: byFeature.map((row) => ({
        feature: row.feature,
        total: Number(row.total),
        positive: Number(row.positive),
        negative: Number(row.negative),
      })),
    };
  },
};
