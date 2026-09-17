import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { tools } from "../lib/tools/registry";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const toolTranslations: Record<
  string,
  Record<string, { title: string; description: string }>
> = {
  "merge-pdf": {
    en: { title: "Merge PDF", description: "Combine multiple PDF files into one." },
    ar: { title: "دمج PDF", description: "ادمج عدة ملفات PDF في ملف واحد." },
    tr: { title: "PDF Birleştir", description: "Birden fazla PDF dosyasını birleştirin." },
  },
};

/**
 * Billing/subscriptions are not live -- no plan is actually purchasable
 * yet, so there is no real product decision to encode per tool. Rather
 * than inventing 35 individually hand-picked PRO limits with no business
 * basis, PRO's `ToolLimit` rows are derived from the FREE tier's own
 * already-decided values by a single, uniform multiplier. This closes the
 * real gap (a PRO subscriber previously fell through to FREE limits
 * silently, since no PRO rows existed at all -- see docs/DECISIONS.md)
 * without pretending a specific per-tool PRO pricing tier was designed.
 * Revisit with real numbers once billing actually ships.
 */
const PRO_LIMIT_MULTIPLIER = 3;

function deriveProLimits(freeLimits: {
  maxFileSizeBytes: number;
  maxFiles: number;
  maxPages: number;
  dailyOperations: number;
}) {
  return {
    maxFileSizeBytes: freeLimits.maxFileSizeBytes * PRO_LIMIT_MULTIPLIER,
    maxFiles: freeLimits.maxFiles * PRO_LIMIT_MULTIPLIER,
    maxPages: freeLimits.maxPages * PRO_LIMIT_MULTIPLIER,
    dailyOperations: freeLimits.dailyOperations * PRO_LIMIT_MULTIPLIER,
  };
}

async function main() {
  const free = await prisma.plan.upsert({
    where: { tier: "FREE" },
    update: {},
    create: {
      tier: "FREE",
      name: "Free",
      description: "Get started with core PDF tools.",
    },
  });

  const pro = await prisma.plan.upsert({
    where: { tier: "PRO" },
    update: {},
    create: {
      tier: "PRO",
      name: "Pro",
      description: "Higher limits and priority processing.",
    },
  });

  for (const tool of tools) {
    await prisma.tool.upsert({
      where: { id: tool.id },
      update: {
        slug: tool.slug,
        category: tool.category,
        processor: tool.processor,
        enabled: tool.enabled,
        guestEnabled: tool.guestEnabled,
      },
      create: {
        id: tool.id,
        slug: tool.slug,
        category: tool.category,
        processor: tool.processor,
        enabled: tool.enabled,
        guestEnabled: tool.guestEnabled,
      },
    });

    const translations = toolTranslations[tool.id] ?? {};
    for (const [locale, content] of Object.entries(translations)) {
      await prisma.toolTranslation.upsert({
        where: { toolId_locale: { toolId: tool.id, locale } },
        update: content,
        create: { toolId: tool.id, locale, ...content },
      });
    }

    // Guest tier limit (planId left null — see docs/DECISIONS.md).
    const existingGuestLimit = await prisma.toolLimit.findFirst({
      where: { toolId: tool.id, planId: null },
    });
    if (existingGuestLimit) {
      await prisma.toolLimit.update({
        where: { id: existingGuestLimit.id },
        data: tool.limits.guest,
      });
    } else {
      await prisma.toolLimit.create({
        data: { toolId: tool.id, planId: null, ...tool.limits.guest },
      });
    }

    // Free plan (registered user) tier limit.
    const existingFreeLimit = await prisma.toolLimit.findFirst({
      where: { toolId: tool.id, planId: free.id },
    });
    if (existingFreeLimit) {
      await prisma.toolLimit.update({
        where: { id: existingFreeLimit.id },
        data: tool.limits.free,
      });
    } else {
      await prisma.toolLimit.create({
        data: { toolId: tool.id, planId: free.id, ...tool.limits.free },
      });
    }

    // Pro plan tier limit -- see deriveProLimits() above for why this is
    // a multiplier of FREE rather than a hand-picked value.
    const proLimits = deriveProLimits(tool.limits.free);
    const existingProLimit = await prisma.toolLimit.findFirst({
      where: { toolId: tool.id, planId: pro.id },
    });
    if (existingProLimit) {
      await prisma.toolLimit.update({
        where: { id: existingProLimit.id },
        data: proLimits,
      });
    } else {
      await prisma.toolLimit.create({
        data: { toolId: tool.id, planId: pro.id, ...proLimits },
      });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
