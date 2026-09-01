import { PrismaClient } from "@prisma/client";
import { tools } from "../lib/tools/registry";

const prisma = new PrismaClient();

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

  await prisma.plan.upsert({
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
